package model

import (
	"time"

	"gorm.io/gorm"
)

type Card struct {
	ID           uint           `gorm:"primaryKey" json:"id"`
	DeckID       uint           `gorm:"not null;index" json:"deck_id"`
	Front        string         `gorm:"not null" json:"front"`
	Back         string         `gorm:"not null" json:"back"`
	Marked       bool           `gorm:"not null;default:false" json:"marked"`
	CorrectCount int            `gorm:"not null;default:0" json:"correct_count"`
	WrongCount   int            `gorm:"not null;default:0" json:"wrong_count"`
	CreatedAt    time.Time      `json:"created_at"`
	UpdatedAt    time.Time      `json:"updated_at"`
	DeletedAt    gorm.DeletedAt `gorm:"index" json:"-"`
}
