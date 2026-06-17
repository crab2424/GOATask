package handler

import (
	"net/http"
	"strconv"

	"github.com/crab2424/goatask/backend/internal/model"
	"github.com/labstack/echo/v4"
	"gorm.io/gorm"
)

type TaskHandler struct {
	DB *gorm.DB
}

func NewTaskHandler(db *gorm.DB) *TaskHandler {
	return &TaskHandler{DB: db}
}

func (h *TaskHandler) Register(g *echo.Group) {
	g.GET("/tasks", h.list)
	g.POST("/tasks", h.create)
	g.GET("/tasks/:id", h.get)
	g.PUT("/tasks/:id", h.update)
	g.DELETE("/tasks/:id", h.delete)
}

func (h *TaskHandler) list(c echo.Context) error {
	var tasks []model.Task
	if err := h.DB.Order("created_at DESC").Find(&tasks).Error; err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.JSON(http.StatusOK, tasks)
}

func (h *TaskHandler) create(c echo.Context) error {
	var t model.Task
	if err := c.Bind(&t); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	if t.Title == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "title is required")
	}
	if t.Status == "" {
		t.Status = model.TaskStatusTodo
	}
	if err := h.DB.Create(&t).Error; err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.JSON(http.StatusCreated, t)
}

func (h *TaskHandler) get(c echo.Context) error {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid id")
	}
	var t model.Task
	if err := h.DB.First(&t, id).Error; err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "task not found")
	}
	return c.JSON(http.StatusOK, t)
}

func (h *TaskHandler) update(c echo.Context) error {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid id")
	}
	var t model.Task
	if err := h.DB.First(&t, id).Error; err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "task not found")
	}
	if err := c.Bind(&t); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	if err := h.DB.Save(&t).Error; err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.JSON(http.StatusOK, t)
}

func (h *TaskHandler) delete(c echo.Context) error {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid id")
	}
	if err := h.DB.Delete(&model.Task{}, id).Error; err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.NoContent(http.StatusNoContent)
}
