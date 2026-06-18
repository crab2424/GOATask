package handler

import (
	"net/http"
	"strconv"
	"strings"

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
	g.PATCH("/tasks/:id/subtasks/:sid", h.toggleSubtask)
}

func (h *TaskHandler) list(c echo.Context) error {
	var tasks []model.Task
	if err := h.DB.Preload("Subtasks", func(db *gorm.DB) *gorm.DB {
		return db.Order("position ASC, id ASC")
	}).Order("created_at DESC").Find(&tasks).Error; err != nil {
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
	t.Subtasks = nil
	if err := h.DB.Create(&t).Error; err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	if err := syncSubtasks(h.DB, &t); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	if err := h.DB.Preload("Subtasks", func(db *gorm.DB) *gorm.DB {
		return db.Order("position ASC, id ASC")
	}).First(&t, t.ID).Error; err != nil {
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
	if err := h.DB.Preload("Subtasks", func(db *gorm.DB) *gorm.DB {
		return db.Order("position ASC, id ASC")
	}).First(&t, id).Error; err != nil {
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
	t.Subtasks = nil
	if err := h.DB.Save(&t).Error; err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	if err := syncSubtasks(h.DB, &t); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	if err := h.DB.Preload("Subtasks", func(db *gorm.DB) *gorm.DB {
		return db.Order("position ASC, id ASC")
	}).First(&t, t.ID).Error; err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.JSON(http.StatusOK, t)
}

func (h *TaskHandler) delete(c echo.Context) error {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid id")
	}
	if err := h.DB.Select("Subtasks").Delete(&model.Task{ID: uint(id)}).Error; err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.NoContent(http.StatusNoContent)
}

type subtaskToggleReq struct {
	Done bool `json:"done"`
}

func (h *TaskHandler) toggleSubtask(c echo.Context) error {
	taskID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid id")
	}
	subID, err := strconv.Atoi(c.Param("sid"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid sid")
	}
	var req subtaskToggleReq
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	var sub model.Subtask
	if err := h.DB.Where("task_id = ?", taskID).First(&sub, subID).Error; err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "subtask not found")
	}
	sub.Done = req.Done
	if err := h.DB.Save(&sub).Error; err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	if err := reconcileParentStatus(h.DB, uint(taskID)); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	var t model.Task
	if err := h.DB.Preload("Subtasks", func(db *gorm.DB) *gorm.DB {
		return db.Order("position ASC, id ASC")
	}).First(&t, taskID).Error; err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.JSON(http.StatusOK, t)
}

// extractSubtaskLines pulls lines that start with "・" or "- " (after trim).
func extractSubtaskLines(description string) []string {
	var lines []string
	for _, raw := range strings.Split(description, "\n") {
		trimmed := strings.TrimSpace(raw)
		switch {
		case strings.HasPrefix(trimmed, "・"):
			text := strings.TrimSpace(strings.TrimPrefix(trimmed, "・"))
			if text != "" {
				lines = append(lines, text)
			}
		case strings.HasPrefix(trimmed, "- "):
			text := strings.TrimSpace(strings.TrimPrefix(trimmed, "- "))
			if text != "" {
				lines = append(lines, text)
			}
		}
	}
	return lines
}

// syncSubtasks reconciles subtask rows with the bullet lines in t.Description.
// Existing rows keep their Done state when the text matches; missing rows are
// deleted; new lines become unchecked rows. After sync, parent status is
// reconciled.
func syncSubtasks(db *gorm.DB, t *model.Task) error {
	lines := extractSubtaskLines(t.Description)

	var existing []model.Subtask
	if err := db.Where("task_id = ?", t.ID).Find(&existing).Error; err != nil {
		return err
	}

	used := make(map[uint]bool, len(existing))
	byText := make(map[string][]*model.Subtask, len(existing))
	for i := range existing {
		s := &existing[i]
		byText[s.Text] = append(byText[s.Text], s)
	}

	for i, text := range lines {
		var match *model.Subtask
		for _, s := range byText[text] {
			if !used[s.ID] {
				match = s
				used[s.ID] = true
				break
			}
		}
		if match != nil {
			if match.Position != i {
				match.Position = i
				if err := db.Save(match).Error; err != nil {
					return err
				}
			}
			continue
		}
		newSub := model.Subtask{TaskID: t.ID, Text: text, Position: i}
		if err := db.Create(&newSub).Error; err != nil {
			return err
		}
	}

	for i := range existing {
		s := &existing[i]
		if !used[s.ID] {
			if err := db.Delete(s).Error; err != nil {
				return err
			}
		}
	}

	return reconcileParentStatus(db, t.ID)
}

func reconcileParentStatus(db *gorm.DB, taskID uint) error {
	var subs []model.Subtask
	if err := db.Where("task_id = ?", taskID).Find(&subs).Error; err != nil {
		return err
	}
	if len(subs) == 0 {
		return nil
	}
	doneCount := 0
	for _, s := range subs {
		if s.Done {
			doneCount++
		}
	}
	var want model.TaskStatus
	switch {
	case doneCount == len(subs):
		want = model.TaskStatusDone
	case doneCount > 0:
		want = model.TaskStatusDoing
	default:
		want = model.TaskStatusTodo
	}
	var t model.Task
	if err := db.First(&t, taskID).Error; err != nil {
		return err
	}
	if t.Status != want {
		t.Status = want
		return db.Save(&t).Error
	}
	return nil
}
