package handler

import (
	"github.com/crab2424/goatask/backend/internal/events"
	"github.com/labstack/echo/v4"
)

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
