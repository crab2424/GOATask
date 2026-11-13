package handler

import (
	"github.com/crab2424/goatask/backend/internal/events"
	"github.com/labstack/echo/v4"
	"gorm.io/gorm"
)

// ownsRow は id の行が uid の所有かを返す。id が nil（未所属）なら常に true。
// model には &model.Project{} のようなテーブルを示す値を渡す。
func ownsRow(db *gorm.DB, model any, uid uint, id *uint) bool {
	if id == nil {
		return true
	}
	var n int64
	if err := db.Model(model).Where("id = ? AND user_id = ?", *id, uid).Count(&n).Error; err != nil {
		return false
	}
	return n > 0
}

// sameID は2つの任意ID（nil可）が同じ値かを返す。
func sameID(a, b *uint) bool {
	if a == nil || b == nil {
		return a == b
	}
	return *a == *b
}

// originID はリクエストヘッダ X-Client-Id を返す。
// フロントの api/client.ts が全リクエストで自動付与する。
// この値をイベントに載せることで、送信元クライアントが自分のechoを無視できる。
func originID(c echo.Context) string {
	return c.Request().Header.Get("X-Client-Id")
}

// publish は共通のnil-safeなHub送信ヘルパ。
// hub が nil の時 (テスト等) は何もせずスキップする。
func publish(hub *events.Hub, userID uint, kind string, id uint, origin string) {
	if hub == nil {
		return
	}
	hub.Publish(userID, events.Event{Kind: kind, ID: id, OriginID: origin})
}
