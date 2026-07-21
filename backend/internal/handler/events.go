package handler

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/crab2424/goatask/backend/internal/auth"
	"github.com/crab2424/goatask/backend/internal/events"
	"github.com/labstack/echo/v4"
)

type EventsHandler struct {
	hub *events.Hub
}

func NewEventsHandler(hub *events.Hub) *EventsHandler {
	return &EventsHandler{hub: hub}
}

func (h *EventsHandler) Register(g *echo.Group) {
	g.GET("/events", h.stream)
}

// stream はSSE (text/event-stream) でユーザー宛のイベントを配信する。
// アイドル時は15秒毎にコメント行だけ流してプロキシのタイムアウトを防ぐ。
func (h *EventsHandler) stream(c echo.Context) error {
	userID := auth.UserID(c)
	if userID == 0 {
		return echo.NewHTTPError(http.StatusUnauthorized, "not authenticated")
	}

	res := c.Response()
	res.Header().Set("Content-Type", "text/event-stream")
	res.Header().Set("Cache-Control", "no-cache")
	res.Header().Set("Connection", "keep-alive")
	res.Header().Set("X-Accel-Buffering", "no")
	res.WriteHeader(http.StatusOK)

	flusher, ok := res.Writer.(http.Flusher)
	if !ok {
		return echo.NewHTTPError(http.StatusInternalServerError, "streaming not supported")
	}

	// 初回にretryとhelloを送って接続確認を容易にする
	if _, err := res.Write([]byte("retry: 3000\n")); err != nil {
		return nil
	}
	if _, err := res.Write([]byte(": connected\n\n")); err != nil {
		return nil
	}
	flusher.Flush()

	ch, unsub := h.hub.Subscribe(userID)
	defer unsub()

	keepalive := time.NewTicker(15 * time.Second)
	defer keepalive.Stop()

	ctx := c.Request().Context()
	for {
		select {
		case <-ctx.Done():
			return nil
		case ev, ok := <-ch:
			if !ok {
				return nil
			}
			payload, err := json.Marshal(ev)
			if err != nil {
				continue
			}
			if _, err := res.Write([]byte("event: " + ev.Kind + "\ndata: ")); err != nil {
				return nil
			}
			if _, err := res.Write(payload); err != nil {
				return nil
			}
			if _, err := res.Write([]byte("\n\n")); err != nil {
				return nil
			}
			flusher.Flush()
		case <-keepalive.C:
			if _, err := res.Write([]byte(": keepalive\n\n")); err != nil {
				return nil
			}
			flusher.Flush()
		}
	}
}
