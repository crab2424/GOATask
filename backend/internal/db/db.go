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
	if err := conn.AutoMigrate(&model.Task{}, &model.Memo{}, &model.Subtask{}, &model.Folder{}); err != nil {
		return nil, err
	}
	return conn, nil
}
