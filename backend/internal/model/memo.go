package model

import (
	"time"

	"gorm.io/gorm"
)

type Memo struct {
	ID        uint           `gorm:"primaryKey" json:"id"`
	UserID    uint           `gorm:"index;not null" json:"user_id"`
	Title     string         `gorm:"not null" json:"title"`
	Content   string         `gorm:"type:text" json:"content"`
	FolderID  *uint          `gorm:"index" json:"folder_id,omitempty"`
	Position  int            `gorm:"not null;default:0" json:"position"`
	Color     string         `gorm:"type:varchar(16);default:''" json:"color"`
	FontSize  string         `gorm:"type:varchar(8);default:''" json:"font_size"`
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`
}
