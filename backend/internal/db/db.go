package db

import (
	"github.com/crab2424/goatask/backend/internal/config"
	"github.com/crab2424/goatask/backend/internal/model"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

func Connect(cfg *config.Config) (*gorm.DB, error) {
	return gorm.Open(postgres.Open(cfg.DSN()), &gorm.Config{})
}

func MigrateAuth(conn *gorm.DB) error {
	return conn.AutoMigrate(&model.User{}, &model.Session{})
}

func MigrateAll(conn *gorm.DB) error {
	if err := MigrateAuth(conn); err != nil {
		return err
	}
	return conn.AutoMigrate(
		&model.Task{},
		&model.Memo{},
		&model.Subtask{},
		&model.Folder{},
		&model.Deck{},
		&model.Card{},
		&model.Project{},
	)
}
