package model

import (
	"time"

	"gorm.io/gorm"
)

type CalendarNote struct {
	ID        uint           `gorm:"primaryKey" json:"id"`
	UserID    uint           `gorm:"index;not null" json:"user_id"`
	Date      time.Time      `gorm:"type:date;index;not null" json:"date"`
	Title     string         `gorm:"not null" json:"title"`
	Color     string         `gorm:"type:varchar(16);not null;default:'violet'" json:"color"`
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`
}
