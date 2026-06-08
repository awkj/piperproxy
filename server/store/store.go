// Package store 提供基于 SQLite 的持久化层（决策 D7）。
// 规则组 / Values / 回收站 全部存储在同一个数据库文件中。
package store

import (
	"database/sql"
	"fmt"
	"path/filepath"

	_ "modernc.org/sqlite" // SQLite driver
)

const schema = `
CREATE TABLE IF NOT EXISTS rule_groups (
    name       TEXT PRIMARY KEY,
    value      TEXT    NOT NULL DEFAULT '',
    selected   INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);

CREATE TABLE IF NOT EXISTS rule_settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL DEFAULT ''
);

INSERT OR IGNORE INTO rule_settings (key, value) VALUES
    ('disabled_all_rules',     '0'),
    ('allow_multiple_choice',  '0'),
    ('default_rules_disabled', '0');

CREATE TABLE IF NOT EXISTS values_store (
    name       TEXT PRIMARY KEY,
    value      TEXT    NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);

CREATE TABLE IF NOT EXISTS values_recycle (
    name       TEXT PRIMARY KEY,
    value      TEXT    NOT NULL DEFAULT '',
    deleted_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
`

// DB 是 piper 数据库的封装。
type DB struct {
	sql *sql.DB
}

// Open 打开（或创建）数据库文件并迁移 schema。dataDir 是 piper 数据目录。
func Open(dataDir string) (*DB, error) {
	path := filepath.Join(dataDir, "piper.db")
	db, err := sql.Open("sqlite", path+"?_journal_mode=WAL&_busy_timeout=5000")
	if err != nil {
		return nil, fmt.Errorf("store: open: %w", err)
	}
	if _, err := db.Exec(schema); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("store: migrate: %w", err)
	}
	return &DB{sql: db}, nil
}

// Close 关闭数据库连接。
func (d *DB) Close() error { return d.sql.Close() }
