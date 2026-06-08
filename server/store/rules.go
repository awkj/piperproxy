package store

import (
	"context"
	"database/sql"
	"fmt"
	"time"
)

// RuleGroup 是规则组的完整数据。
type RuleGroup struct {
	Name      string
	Value     string
	Selected  bool
	SortOrder int
}

// RuleSettings 是全局规则开关。
type RuleSettings struct {
	DisabledAllRules    bool
	AllowMultipleChoice bool
	DefaultDisabled     bool
}

// --------------------------------------------------------------------------
// 规则组 CRUD
// --------------------------------------------------------------------------

// ListRules 返回所有规则组，按 sort_order ASC, name ASC 排序。
func (d *DB) ListRules(ctx context.Context) ([]RuleGroup, error) {
	rows, err := d.sql.QueryContext(ctx,
		`SELECT name, value, selected, sort_order FROM rule_groups ORDER BY sort_order, name`,
	)
	if err != nil {
		return nil, fmt.Errorf("store: list rules: %w", err)
	}
	defer rows.Close()

	var out []RuleGroup
	for rows.Next() {
		var g RuleGroup
		var sel int
		if err := rows.Scan(&g.Name, &g.Value, &sel, &g.SortOrder); err != nil {
			return nil, err
		}
		g.Selected = sel != 0
		out = append(out, g)
	}
	return out, rows.Err()
}

// GetRule 返回单个规则组；找不到返回 sql.ErrNoRows。
func (d *DB) GetRule(ctx context.Context, name string) (RuleGroup, error) {
	var g RuleGroup
	var sel int
	err := d.sql.QueryRowContext(ctx,
		`SELECT name, value, selected, sort_order FROM rule_groups WHERE name = ?`, name,
	).Scan(&g.Name, &g.Value, &sel, &g.SortOrder)
	if err != nil {
		return RuleGroup{}, err
	}
	g.Selected = sel != 0
	return g, nil
}

// AddRule 新建规则组（name 已存在则返回错误）。
func (d *DB) AddRule(ctx context.Context, name, value string) error {
	maxOrder := 0
	_ = d.sql.QueryRowContext(ctx, `SELECT COALESCE(MAX(sort_order),0) FROM rule_groups`).Scan(&maxOrder)
	_, err := d.sql.ExecContext(ctx,
		`INSERT INTO rule_groups (name, value, sort_order, created_at) VALUES (?, ?, ?, ?)`,
		name, value, maxOrder+1, time.Now().Unix(),
	)
	if err != nil {
		return fmt.Errorf("store: add rule %q: %w", name, err)
	}
	return nil
}

// SaveRule 更新规则组内容（upsert value）。
func (d *DB) SaveRule(ctx context.Context, name, value string) error {
	res, err := d.sql.ExecContext(ctx,
		`UPDATE rule_groups SET value = ? WHERE name = ?`, value, name,
	)
	if err != nil {
		return fmt.Errorf("store: save rule: %w", err)
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return sql.ErrNoRows
	}
	return nil
}

// RemoveRule 删除规则组（不存在时静默）。
func (d *DB) RemoveRule(ctx context.Context, name string) error {
	_, err := d.sql.ExecContext(ctx, `DELETE FROM rule_groups WHERE name = ?`, name)
	return err
}

// RenameRule 重命名规则组。
func (d *DB) RenameRule(ctx context.Context, name, newName string) error {
	res, err := d.sql.ExecContext(ctx,
		`UPDATE rule_groups SET name = ? WHERE name = ?`, newName, name,
	)
	if err != nil {
		return fmt.Errorf("store: rename rule: %w", err)
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return sql.ErrNoRows
	}
	return nil
}

// EnableRule 将规则组标记为已启用；若 allowMultipleChoice=false 则先禁用所有其他组。
func (d *DB) EnableRule(ctx context.Context, name string, allowMultipleChoice bool) error {
	tx, err := d.sql.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback() //nolint:errcheck
	if !allowMultipleChoice {
		if _, err := tx.ExecContext(ctx, `UPDATE rule_groups SET selected = 0`); err != nil {
			return err
		}
	}
	res, err := tx.ExecContext(ctx, `UPDATE rule_groups SET selected = 1 WHERE name = ?`, name)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return sql.ErrNoRows
	}
	return tx.Commit()
}

// DisableRule 将规则组标记为未启用。
func (d *DB) DisableRule(ctx context.Context, name string) error {
	_, err := d.sql.ExecContext(ctx, `UPDATE rule_groups SET selected = 0 WHERE name = ?`, name)
	return err
}

// --------------------------------------------------------------------------
// 全局规则设置
// --------------------------------------------------------------------------

// GetRuleSettings 读取全局规则开关。
func (d *DB) GetRuleSettings(ctx context.Context) (RuleSettings, error) {
	rows, err := d.sql.QueryContext(ctx, `SELECT key, value FROM rule_settings`)
	if err != nil {
		return RuleSettings{}, err
	}
	defer rows.Close()

	m := map[string]string{}
	for rows.Next() {
		var k, v string
		if err := rows.Scan(&k, &v); err != nil {
			return RuleSettings{}, err
		}
		m[k] = v
	}
	return RuleSettings{
		DisabledAllRules:    m["disabled_all_rules"] == "1",
		AllowMultipleChoice: m["allow_multiple_choice"] == "1",
		DefaultDisabled:     m["default_rules_disabled"] == "1",
	}, rows.Err()
}

// SetRuleSetting 更新单个全局规则开关。
func (d *DB) SetRuleSetting(ctx context.Context, key string, value bool) error {
	v := "0"
	if value {
		v = "1"
	}
	_, err := d.sql.ExecContext(ctx,
		`INSERT INTO rule_settings (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
		key, v,
	)
	return err
}
