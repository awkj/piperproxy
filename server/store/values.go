package store

import (
	"context"
	"database/sql"
	"fmt"
	"time"
)

// ValueItem 是单条 value 的数据。
type ValueItem struct {
	Name  string
	Value string
}

// --------------------------------------------------------------------------
// Values CRUD
// --------------------------------------------------------------------------

// ListValues 返回所有 values，按 name ASC 排序。
func (d *DB) ListValues(ctx context.Context) ([]ValueItem, error) {
	rows, err := d.sql.QueryContext(ctx, `SELECT name, value FROM values_store ORDER BY name`)
	if err != nil {
		return nil, fmt.Errorf("store: list values: %w", err)
	}
	defer rows.Close()

	var out []ValueItem
	for rows.Next() {
		var v ValueItem
		if err := rows.Scan(&v.Name, &v.Value); err != nil {
			return nil, err
		}
		out = append(out, v)
	}
	return out, rows.Err()
}

// AddValue 新建 value；name 已存在则更新 value。
func (d *DB) AddValue(ctx context.Context, name, value string) error {
	_, err := d.sql.ExecContext(ctx,
		`INSERT INTO values_store (name, value, created_at) VALUES (?, ?, ?)
         ON CONFLICT(name) DO UPDATE SET value = excluded.value`,
		name, value, time.Now().Unix(),
	)
	return err
}

// RemoveValue 删除 value 并移入回收站。
func (d *DB) RemoveValue(ctx context.Context, name string) error {
	tx, err := d.sql.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback() //nolint:errcheck

	var value string
	if err := tx.QueryRowContext(ctx, `SELECT value FROM values_store WHERE name = ?`, name).Scan(&value); err != nil {
		if err == sql.ErrNoRows {
			return nil // 静默
		}
		return err
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM values_store WHERE name = ?`, name); err != nil {
		return err
	}
	_, err = tx.ExecContext(ctx,
		`INSERT INTO values_recycle (name, value, deleted_at) VALUES (?, ?, ?)
         ON CONFLICT(name) DO UPDATE SET value = excluded.value, deleted_at = excluded.deleted_at`,
		name, value, time.Now().Unix(),
	)
	if err != nil {
		return err
	}
	return tx.Commit()
}

// RenameValue 重命名 value。
func (d *DB) RenameValue(ctx context.Context, name, newName string) error {
	res, err := d.sql.ExecContext(ctx,
		`UPDATE values_store SET name = ? WHERE name = ?`, newName, name,
	)
	if err != nil {
		return fmt.Errorf("store: rename value: %w", err)
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return sql.ErrNoRows
	}
	return nil
}

// --------------------------------------------------------------------------
// 回收站
// --------------------------------------------------------------------------

// ListRecycle 返回回收站中的 values，按 deleted_at DESC 排序。
func (d *DB) ListRecycle(ctx context.Context) ([]ValueItem, error) {
	rows, err := d.sql.QueryContext(ctx,
		`SELECT name, value FROM values_recycle ORDER BY deleted_at DESC`,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []ValueItem
	for rows.Next() {
		var v ValueItem
		if err := rows.Scan(&v.Name, &v.Value); err != nil {
			return nil, err
		}
		out = append(out, v)
	}
	return out, rows.Err()
}

// GetRecycleItem 查询回收站中的单条。
func (d *DB) GetRecycleItem(ctx context.Context, name string) (ValueItem, error) {
	var v ValueItem
	err := d.sql.QueryRowContext(ctx,
		`SELECT name, value FROM values_recycle WHERE name = ?`, name,
	).Scan(&v.Name, &v.Value)
	if err != nil {
		return ValueItem{}, err
	}
	return v, nil
}

// RemoveRecycleItem 从回收站中删除（彻底删除）。
func (d *DB) RemoveRecycleItem(ctx context.Context, name string) error {
	_, err := d.sql.ExecContext(ctx, `DELETE FROM values_recycle WHERE name = ?`, name)
	return err
}
