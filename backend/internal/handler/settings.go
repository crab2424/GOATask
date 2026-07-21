package handler

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"

	"github.com/crab2424/goatask/backend/internal/auth"
	"github.com/crab2424/goatask/backend/internal/events"
	"github.com/crab2424/goatask/backend/internal/model"
	"github.com/labstack/echo/v4"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

const maxSettingsBytes = 64 * 1024

type SettingsHandler struct {
	DB  *gorm.DB
	Hub *events.Hub
}

func NewSettingsHandler(db *gorm.DB, hub *events.Hub) *SettingsHandler {
	return &SettingsHandler{DB: db, Hub: hub}
}

func (h *SettingsHandler) Register(g *echo.Group) {
	g.GET("/settings", h.get)
	g.PUT("/settings", h.put)
}

func (h *SettingsHandler) get(c echo.Context) error {
	uid := auth.UserID(c)
	var setting model.UserSetting
	if err := h.DB.First(&setting, "user_id = ?", uid).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return c.JSONBlob(http.StatusOK, []byte("{}"))
		}
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.JSONBlob(http.StatusOK, []byte(setting.Data))
}

func (h *SettingsHandler) put(c echo.Context) error {
	uid := auth.UserID(c)
	body, err := io.ReadAll(io.LimitReader(c.Request().Body, maxSettingsBytes+1))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	if len(body) > maxSettingsBytes {
		return echo.NewHTTPError(http.StatusRequestEntityTooLarge, "settings too large")
	}
	if !json.Valid(body) || len(body) == 0 || body[0] != '{' {
		return echo.NewHTTPError(http.StatusBadRequest, "body must be a JSON object")
	}

	setting := model.UserSetting{UserID: uid, Data: string(body)}
	if err := h.DB.Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "user_id"}},
		DoUpdates: clause.AssignmentColumns([]string{"data", "updated_at"}),
	}).Create(&setting).Error; err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	publish(h.Hub, uid, "settings.updated", 0, originID(c))
	return c.JSONBlob(http.StatusOK, body)
}
