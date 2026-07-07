package model

import "time"

// UserSetting はユーザーごとの設定をJSONの塊として1行で持つ。
// スキーマ（キーコンフィグ等の中身）はフロントエンドが所有し、サーバーは保存のみ担当する。
type UserSetting struct {
	UserID    uint      `gorm:"primaryKey" json:"-"`
	Data      string    `gorm:"type:jsonb;not null;default:'{}'" json:"data"`
	UpdatedAt time.Time `json:"updated_at"`
}
