package handler

import (
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/crab2424/goatask/backend/internal/auth"
	"github.com/crab2424/goatask/backend/internal/model"
	"github.com/labstack/echo/v4"
	"gorm.io/gorm"
)

type CalendarHandler struct{ DB *gorm.DB }

func NewCalendarHandler(db *gorm.DB) *CalendarHandler { return &CalendarHandler{DB: db} }

func (h *CalendarHandler) Register(g *echo.Group) {
	g.GET("/calendar", h.list)
	g.POST("/calendar-notes", h.createNote)
	g.PUT("/calendar-notes/:id", h.updateNote)
	g.DELETE("/calendar-notes/:id", h.deleteNote)
}

type calendarPayload struct {
	Tasks []model.Task         `json:"tasks"`
	Notes []model.CalendarNote `json:"notes"`
}

func calendarDate(value string) (time.Time, error) {
	return time.Parse("2006-01-02", value)
}

func (h *CalendarHandler) list(c echo.Context) error {
	uid := auth.UserID(c)
	from, err := calendarDate(c.QueryParam("from"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid from")
	}
	to, err := calendarDate(c.QueryParam("to"))
	if err != nil || to.Before(from) {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid to")
	}

	var tasks []model.Task
	if err := h.DB.Where("user_id = ? AND ((start_date IS NOT NULL AND start_date <= ? AND COALESCE(due_date, start_date) >= ?) OR (start_date IS NULL AND due_date >= ? AND due_date <= ?))", uid, to, from, from, to).
		Order("COALESCE(start_date, due_date) ASC, id ASC").Find(&tasks).Error; err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	var notes []model.CalendarNote
	if err := h.DB.Where("user_id = ? AND date >= ? AND date <= ?", uid, from, to).Order("date ASC, id ASC").Find(&notes).Error; err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.JSON(http.StatusOK, calendarPayload{Tasks: tasks, Notes: notes})
}

func bindCalendarNote(c echo.Context, note *model.CalendarNote) error {
	var input struct {
		Date  string `json:"date"`
		Title string `json:"title"`
		Color string `json:"color"`
	}
	if err := c.Bind(&input); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	date, err := calendarDate(input.Date)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid date")
	}
	input.Title = strings.TrimSpace(input.Title)
	if input.Title == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "title is required")
	}
	if input.Color == "" {
		input.Color = "violet"
	}
	note.Date, note.Title, note.Color = date, input.Title, input.Color
	return nil
}

func (h *CalendarHandler) createNote(c echo.Context) error {
	note := model.CalendarNote{UserID: auth.UserID(c)}
	if err := bindCalendarNote(c, &note); err != nil {
		return err
	}
	if err := h.DB.Create(&note).Error; err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.JSON(http.StatusCreated, note)
}

func (h *CalendarHandler) updateNote(c echo.Context) error {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid id")
	}
	var note model.CalendarNote
	if err := h.DB.Where("id = ? AND user_id = ?", id, auth.UserID(c)).First(&note).Error; err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "calendar note not found")
	}
	if err := bindCalendarNote(c, &note); err != nil {
		return err
	}
	if err := h.DB.Save(&note).Error; err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.JSON(http.StatusOK, note)
}

func (h *CalendarHandler) deleteNote(c echo.Context) error {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid id")
	}
	result := h.DB.Where("id = ? AND user_id = ?", id, auth.UserID(c)).Delete(&model.CalendarNote{})
	if result.Error != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, result.Error.Error())
	}
	if result.RowsAffected == 0 {
		return echo.NewHTTPError(http.StatusNotFound, "calendar note not found")
	}
	return c.NoContent(http.StatusNoContent)
}
