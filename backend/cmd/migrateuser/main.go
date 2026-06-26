package main

import (
	"errors"
	"flag"
	"fmt"
	"os"

	"github.com/crab2424/goatask/backend/internal/config"
	"github.com/crab2424/goatask/backend/internal/db"
	"github.com/crab2424/goatask/backend/internal/model"
	"gorm.io/gorm"
)

// 既存データの user_id を一括 backfill するための一回限りの移行コマンド。
// 各テーブルに対して: ADD COLUMN (NULL) → backfill → SET NOT NULL → INDEX。
// 既に NOT NULL なら何もしない (idempotent)。
var targets = []string{"tasks", "memos", "folders", "decks", "projects"}

func main() {
	username := flag.String("u", "", "username to assign existing rows to (defaults to the first user)")
	flag.Parse()

	cfg := config.Load()
	conn, err := db.Connect(cfg)
	if err != nil {
		fmt.Fprintln(os.Stderr, "db connect:", err)
		os.Exit(1)
	}
	if err := db.MigrateAuth(conn); err != nil {
		fmt.Fprintln(os.Stderr, "migrate auth:", err)
		os.Exit(1)
	}

	user, err := pickUser(conn, *username)
	if err != nil {
		fmt.Fprintln(os.Stderr, "pick user:", err)
		os.Exit(1)
	}
	fmt.Printf("backfill target user: id=%d username=%s\n", user.ID, user.Username)

	for _, table := range targets {
		if err := backfillTable(conn, table, user.ID); err != nil {
			fmt.Fprintf(os.Stderr, "backfill %s: %v\n", table, err)
			os.Exit(1)
		}
	}

	if err := db.MigrateAll(conn); err != nil {
		fmt.Fprintln(os.Stderr, "final automigrate:", err)
		os.Exit(1)
	}
	fmt.Println("migration complete")
}

func pickUser(conn *gorm.DB, username string) (*model.User, error) {
	var u model.User
	q := conn.Order("id ASC")
	if username != "" {
		q = q.Where("username = ?", username)
	}
	if err := q.First(&u).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, fmt.Errorf("no user found (run createuser first)")
		}
		return nil, err
	}
	return &u, nil
}

func backfillTable(conn *gorm.DB, table string, userID uint) error {
	if !conn.Migrator().HasTable(table) {
		fmt.Printf("skip %s: table does not exist\n", table)
		return nil
	}

	if !conn.Migrator().HasColumn(tableModel(table), "user_id") {
		if err := conn.Exec(fmt.Sprintf("ALTER TABLE %s ADD COLUMN user_id BIGINT", table)).Error; err != nil {
			return fmt.Errorf("add column: %w", err)
		}
		fmt.Printf("%s: added user_id column\n", table)
	}

	res := conn.Exec(fmt.Sprintf("UPDATE %s SET user_id = ? WHERE user_id IS NULL", table), userID)
	if res.Error != nil {
		return fmt.Errorf("backfill: %w", res.Error)
	}
	if res.RowsAffected > 0 {
		fmt.Printf("%s: backfilled %d rows\n", table, res.RowsAffected)
	}

	if err := conn.Exec(fmt.Sprintf("ALTER TABLE %s ALTER COLUMN user_id SET NOT NULL", table)).Error; err != nil {
		return fmt.Errorf("set not null: %w", err)
	}

	if err := conn.Exec(fmt.Sprintf("CREATE INDEX IF NOT EXISTS idx_%s_user_id ON %s(user_id)", table, table)).Error; err != nil {
		return fmt.Errorf("create index: %w", err)
	}

	return nil
}

func tableModel(table string) interface{} {
	switch table {
	case "tasks":
		return &model.Task{}
	case "memos":
		return &model.Memo{}
	case "folders":
		return &model.Folder{}
	case "decks":
		return &model.Deck{}
	case "projects":
		return &model.Project{}
	}
	return nil
}
