package handler

import (
	"net/http"
	"strconv"

	"github.com/crab2424/goatask/backend/internal/model"
	"github.com/labstack/echo/v4"
	"gorm.io/gorm"
)

type MemoHandler struct {
	DB *gorm.DB
}

func NewMemoHandler(db *gorm.DB) *MemoHandler {
	return &MemoHandler{DB: db}
}

func (h *MemoHandler) Register(g *echo.Group) {
	g.GET("/memos", h.list)
	g.POST("/memos", h.create)
	g.GET("/memos/:id", h.get)
	g.PUT("/memos/:id", h.update)
	g.DELETE("/memos/:id", h.delete)
}

func (h *MemoHandler) list(c echo.Context) error {
	var memos []model.Memo
	if err := h.DB.Order("updated_at DESC").Find(&memos).Error; err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.JSON(http.StatusOK, memos)
}

func (h *MemoHandler) create(c echo.Context) error {
	var m model.Memo
	if err := c.Bind(&m); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	if m.Title == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "title is required")
	}
	if err := h.DB.Create(&m).Error; err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.JSON(http.StatusCreated, m)
}

func (h *MemoHandler) get(c echo.Context) error {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid id")
	}
	var m model.Memo
	if err := h.DB.First(&m, id).Error; err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "memo not found")
	}
	return c.JSON(http.StatusOK, m)
}

func (h *MemoHandler) update(c echo.Context) error {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid id")
	}
	var m model.Memo
	if err := h.DB.First(&m, id).Error; err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "memo not found")
	}
	if err := c.Bind(&m); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	if err := h.DB.Save(&m).Error; err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.JSON(http.StatusOK, m)
}

func (h *MemoHandler) delete(c echo.Context) error {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid id")
	}
	if err := h.DB.Delete(&model.Memo{}, id).Error; err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.NoContent(http.StatusNoContent)
}
