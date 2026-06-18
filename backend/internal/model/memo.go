package model

import (
	"time"

	"gorm.io/gorm"
)

type Memo struct {
	ID        uint           `gorm:"primaryKey" json:"id"`
	Title     string         `gorm:"not null" json:"title"`
	Content   string         `gorm:"type:text" json:"content"`
	FolderID  *uint          `gorm:"index" json:"folder_id,omitempty"`
	Color     string         `gorm:"type:varchar(16);default:''" json:"color"`
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`
}
