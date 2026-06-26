package model

import (
	"time"

	"gorm.io/gorm"
)

type Deck struct {
	ID        uint           `gorm:"primaryKey" json:"id"`
	UserID    uint           `gorm:"index;not null" json:"user_id"`
	Name      string         `gorm:"not null" json:"name"`
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`
	Cards     []Card         `gorm:"foreignKey:DeckID;constraint:OnDelete:CASCADE" json:"cards,omitempty"`
}
