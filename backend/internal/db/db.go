package db

import (
	"github.com/crab2424/goatask/backend/internal/config"
	"github.com/crab2424/goatask/backend/internal/model"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

func Connect(cfg *config.Config) (*gorm.DB, error) {
	conn, err := gorm.Open(postgres.Open(cfg.DSN()), &gorm.Config{})
	if err != nil {
		return nil, err
	}
	if err := conn.AutoMigrate(
		&model.User{},
		&model.Session{},
		&model.Task{},
		&model.Memo{},
		&model.Subtask{},
		&model.Folder{},
		&model.Deck{},
		&model.Card{},
		&model.Project{},
	); err != nil {
		return nil, err
	}
	return conn, nil
}
