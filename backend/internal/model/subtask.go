package model

import (
	"time"

	"gorm.io/gorm"
)

type Subtask struct {
	ID        uint           `gorm:"primaryKey" json:"id"`
	TaskID    uint           `gorm:"not null;index" json:"task_id"`
	Text      string         `gorm:"not null" json:"text"`
	Done      bool           `gorm:"not null;default:false" json:"done"`
	Position  int            `gorm:"not null;default:0" json:"position"`
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`
}
