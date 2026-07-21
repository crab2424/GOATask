package model

import "time"

// SharedFile stores metadata for an object in OCI Object Storage.
// The object itself is never stored in PostgreSQL.
type SharedFile struct {
	ID               uint        `gorm:"primaryKey" json:"id"`
	UserID           uint        `gorm:"index;not null" json:"user_id"`
	ObjectName       string      `gorm:"uniqueIndex;size:512;not null" json:"-"`
	OriginalFilename string      `gorm:"size:255;not null" json:"filename"`
	ContentType      string      `gorm:"size:255;not null" json:"content_type"`
	Size             int64       `gorm:"not null" json:"size"`
	ETag             string      `gorm:"size:255" json:"-"`
	CreatedAt        time.Time   `json:"created_at"`
	UpdatedAt        time.Time   `json:"updated_at"`
	Shares           []FileShare `gorm:"foreignKey:FileID" json:"-"`
}

type FileShare struct {
	ID        uint       `gorm:"primaryKey" json:"id"`
	FileID    uint       `gorm:"index;not null" json:"file_id"`
	PARID     string     `gorm:"size:255" json:"-"`
	URL       string     `gorm:"type:text;not null" json:"-"`
	ExpiresAt time.Time  `gorm:"index;not null" json:"expires_at"`
	RevokedAt *time.Time `gorm:"index" json:"revoked_at,omitempty"`
	CreatedAt time.Time  `json:"created_at"`
}
