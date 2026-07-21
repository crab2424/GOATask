package handler

import (
	"net/http"
	"strconv"

	"github.com/crab2424/goatask/backend/internal/auth"
	"github.com/crab2424/goatask/backend/internal/events"
	"github.com/crab2424/goatask/backend/internal/model"
	"github.com/labstack/echo/v4"
	"gorm.io/gorm"
)

type MemoHandler struct {
	DB  *gorm.DB
	Hub *events.Hub
}

func NewMemoHandler(db *gorm.DB, hub *events.Hub) *MemoHandler {
	return &MemoHandler{DB: db, Hub: hub}
}

func (h *MemoHandler) Register(g *echo.Group) {
	g.GET("/memos", h.list)
	g.POST("/memos", h.create)
	g.GET("/memos/:id", h.get)
	g.PUT("/memos/:id", h.update)
	g.DELETE("/memos/:id", h.delete)
	g.PUT("/memos-reorder", h.reorder)
}

func (h *MemoHandler) list(c echo.Context) error {
	uid := auth.UserID(c)
	var memos []model.Memo
	if err := h.DB.Where("user_id = ?", uid).Order("position ASC, updated_at DESC").Find(&memos).Error; err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.JSON(http.StatusOK, memos)
}

type memoReorderReq struct {
	IDs []uint `json:"ids"`
}

func (h *MemoHandler) reorder(c echo.Context) error {
	uid := auth.UserID(c)
	var req memoReorderReq
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	for i, id := range req.IDs {
		if err := h.DB.Model(&model.Memo{}).Where("id = ? AND user_id = ?", id, uid).Update("position", i).Error; err != nil {
			return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
		}
	}
	publish(h.Hub, uid, "memo.updated", 0, originID(c))
	return c.NoContent(http.StatusNoContent)
}

func (h *MemoHandler) create(c echo.Context) error {
	uid := auth.UserID(c)
	var m model.Memo
	if err := c.Bind(&m); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	if m.Title == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "title is required")
	}
	m.UserID = uid
	if err := h.DB.Create(&m).Error; err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	publish(h.Hub, uid, "memo.created", m.ID, originID(c))
	return c.JSON(http.StatusCreated, m)
}

func (h *MemoHandler) get(c echo.Context) error {
	uid := auth.UserID(c)
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid id")
	}
	var m model.Memo
	if err := h.DB.Where("user_id = ?", uid).First(&m, id).Error; err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "memo not found")
	}
	return c.JSON(http.StatusOK, m)
}

func (h *MemoHandler) update(c echo.Context) error {
	uid := auth.UserID(c)
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid id")
	}
	var m model.Memo
	if err := h.DB.Where("user_id = ?", uid).First(&m, id).Error; err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "memo not found")
	}
	if err := c.Bind(&m); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	m.UserID = uid
	if err := h.DB.Save(&m).Error; err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	publish(h.Hub, uid, "memo.updated", m.ID, originID(c))
	return c.JSON(http.StatusOK, m)
}

func (h *MemoHandler) delete(c echo.Context) error {
	uid := auth.UserID(c)
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid id")
	}
	res := h.DB.Where("user_id = ?", uid).Delete(&model.Memo{}, id)
	if res.Error != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, res.Error.Error())
	}
	if res.RowsAffected == 0 {
		return echo.NewHTTPError(http.StatusNotFound, "memo not found")
	}
	publish(h.Hub, uid, "memo.deleted", uint(id), originID(c))
	return c.NoContent(http.StatusNoContent)
}
