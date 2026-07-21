package handler

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/crab2424/goatask/backend/internal/auth"
	"github.com/crab2424/goatask/backend/internal/events"
	"github.com/crab2424/goatask/backend/internal/model"
	"github.com/labstack/echo/v4"
	"gorm.io/gorm"
)

// conflictResponse は409で返す共通のペイロード。
// current にサーバー側の現行値を入れて、クライアント側の
// 「取り込み」導線で最新をそのまま利用できるようにする。
type conflictResponse struct {
	Error   string      `json:"error"`
	Current interface{} `json:"current"`
}

type TaskHandler struct {
	DB  *gorm.DB
	Hub *events.Hub
}

func NewTaskHandler(db *gorm.DB, hub *events.Hub) *TaskHandler {
	return &TaskHandler{DB: db, Hub: hub}
}

func (h *TaskHandler) Register(g *echo.Group) {
	g.GET("/tasks", h.list)
	g.POST("/tasks", h.create)
	g.GET("/tasks/:id", h.get)
	g.PUT("/tasks/:id", h.update)
	g.DELETE("/tasks/:id", h.delete)
	g.PATCH("/tasks/:id/subtasks/:sid", h.toggleSubtask)
	g.PUT("/tasks-reorder", h.reorder)
}

func (h *TaskHandler) list(c echo.Context) error {
	uid := auth.UserID(c)
	var tasks []model.Task
	if err := h.DB.Where("user_id = ?", uid).Preload("Subtasks", func(db *gorm.DB) *gorm.DB {
		return db.Order("position ASC, id ASC")
	}).Order("position ASC, created_at DESC").Find(&tasks).Error; err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.JSON(http.StatusOK, tasks)
}

func (h *TaskHandler) create(c echo.Context) error {
	uid := auth.UserID(c)
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
	if t.StartDate != nil && t.DueDate != nil && t.StartDate.After(*t.DueDate) {
		return echo.NewHTTPError(http.StatusBadRequest, "start_date must be on or before due_date")
	}
	t.UserID = uid
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
	publish(h.Hub, uid, "task.created", t.ID, originID(c))
	return c.JSON(http.StatusCreated, t)
}

func (h *TaskHandler) get(c echo.Context) error {
	uid := auth.UserID(c)
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid id")
	}
	var t model.Task
	if err := h.DB.Where("user_id = ?", uid).Preload("Subtasks", func(db *gorm.DB) *gorm.DB {
		return db.Order("position ASC, id ASC")
	}).First(&t, id).Error; err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "task not found")
	}
	return c.JSON(http.StatusOK, t)
}

func (h *TaskHandler) update(c echo.Context) error {
	uid := auth.UserID(c)
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid id")
	}
	var t model.Task
	if err := h.DB.Where("user_id = ?", uid).First(&t, id).Error; err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "task not found")
	}
	// 楽観ロック: クライアントが編集開始時に見ていたversionをbind前に控え、
	// bind後のt.Version (= クライアント送信version) と比較する。
	currentVersion := t.Version
	if err := c.Bind(&t); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	force := strings.EqualFold(c.QueryParam("force"), "true")
	if !force && t.Version != currentVersion {
		// クライアントが古いversionで来た → サーバーの現行値を返す
		var fresh model.Task
		if err := h.DB.Preload("Subtasks", func(db *gorm.DB) *gorm.DB {
			return db.Order("position ASC, id ASC")
		}).First(&fresh, id).Error; err != nil {
			return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
		}
		return c.JSON(http.StatusConflict, conflictResponse{Error: "version conflict", Current: fresh})
	}
	if t.StartDate != nil && t.DueDate != nil && t.StartDate.After(*t.DueDate) {
		return echo.NewHTTPError(http.StatusBadRequest, "start_date must be on or before due_date")
	}
	t.UserID = uid
	t.Subtasks = nil
	t.Version = currentVersion + 1
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
	publish(h.Hub, uid, "task.updated", t.ID, originID(c))
	return c.JSON(http.StatusOK, t)
}

func (h *TaskHandler) delete(c echo.Context) error {
	uid := auth.UserID(c)
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid id")
	}
	var t model.Task
	if err := h.DB.Where("user_id = ?", uid).First(&t, id).Error; err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "task not found")
	}
	if err := h.DB.Select("Subtasks").Delete(&t).Error; err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	publish(h.Hub, uid, "task.deleted", t.ID, originID(c))
	return c.NoContent(http.StatusNoContent)
}

type subtaskToggleReq struct {
	Done bool `json:"done"`
}

func (h *TaskHandler) toggleSubtask(c echo.Context) error {
	uid := auth.UserID(c)
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
	var parent model.Task
	if err := h.DB.Where("user_id = ?", uid).First(&parent, taskID).Error; err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "task not found")
	}
	var sub model.Subtask
	if err := h.DB.Where("task_id = ?", taskID).First(&sub, subID).Error; err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "subtask not found")
	}
	sub.Done = req.Done
	if err := h.DB.Save(&sub).Error; err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	if newDesc, changed := syncDescriptionCheckboxMarker(parent.Description, sub.Position, sub.Text, sub.Done); changed {
		parent.Description = newDesc
		if err := h.DB.Save(&parent).Error; err != nil {
			return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
		}
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
	publish(h.Hub, uid, "task.updated", t.ID, originID(c))
	return c.JSON(http.StatusOK, t)
}

type reorderReq struct {
	IDs []uint `json:"ids"`
}

func (h *TaskHandler) reorder(c echo.Context) error {
	uid := auth.UserID(c)
	var req reorderReq
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	for i, id := range req.IDs {
		if err := h.DB.Model(&model.Task{}).Where("id = ? AND user_id = ?", id, uid).Update("position", i).Error; err != nil {
			return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
		}
	}
	// 並べ替えは全体リロードで十分。ID=0で「全体変更」を示す。
	publish(h.Hub, uid, "task.updated", 0, originID(c))
	return c.NoContent(http.StatusNoContent)
}

// subtaskLine holds an extracted subtask line and an optional done hint
// inferred from markdown-style checklist syntax (`- [x] ...`).
type subtaskLine struct {
	Text     string
	DoneHint *bool
	// RawIndex is the line's index in strings.Split(description, "\n"),
	// used to patch the exact line back when a checkbox is toggled.
	RawIndex int
	// IsCheckbox is true only for "- [ ]"/"- [x]" lines, which are the only
	// style that carries a done marker in the text. "・" and "- " bullets
	// have no marker to rewrite and must be left untouched.
	IsCheckbox bool
}

// extractSubtaskLines pulls lines that start with "・", "- ", "- [ ]" or
// "- [x]" (after trim). The markdown checklist form may also carry a done hint
// which is used only when a brand-new subtask row is created.
func extractSubtaskLines(description string) []subtaskLine {
	var lines []subtaskLine
	for i, raw := range strings.Split(description, "\n") {
		trimmed := strings.TrimSpace(raw)
		switch {
		case strings.HasPrefix(trimmed, "- [ ]"):
			text := strings.TrimSpace(strings.TrimPrefix(trimmed, "- [ ]"))
			if text != "" {
				done := false
				lines = append(lines, subtaskLine{Text: text, DoneHint: &done, RawIndex: i, IsCheckbox: true})
			}
		case strings.HasPrefix(trimmed, "- [x]") || strings.HasPrefix(trimmed, "- [X]"):
			text := strings.TrimSpace(trimmed[5:])
			if text != "" {
				done := true
				lines = append(lines, subtaskLine{Text: text, DoneHint: &done, RawIndex: i, IsCheckbox: true})
			}
		case strings.HasPrefix(trimmed, "・"):
			text := strings.TrimSpace(strings.TrimPrefix(trimmed, "・"))
			if text != "" {
				lines = append(lines, subtaskLine{Text: text, RawIndex: i})
			}
		case strings.HasPrefix(trimmed, "- "):
			text := strings.TrimSpace(strings.TrimPrefix(trimmed, "- "))
			if text != "" {
				lines = append(lines, subtaskLine{Text: text, RawIndex: i})
			}
		}
	}
	return lines
}

// syncDescriptionCheckboxMarker rewrites the "- [ ]"/"- [x]" marker of the
// subtask line at position (matched by text as a sanity check) so the raw
// description stays consistent with the checkbox's Done state. Lines written
// with "・" or "- " have no marker and are left untouched, since there's
// nothing to flip. Returns the original description and false if nothing
// needed to change (e.g. the description was edited since the last sync and
// no longer lines up with position).
func syncDescriptionCheckboxMarker(description string, position int, text string, done bool) (string, bool) {
	lines := extractSubtaskLines(description)
	if position < 0 || position >= len(lines) {
		return description, false
	}
	line := lines[position]
	if !line.IsCheckbox || line.Text != text {
		return description, false
	}
	marker := "- [ ] "
	if done {
		marker = "- [x] "
	}
	rawLines := strings.Split(description, "\n")
	if line.RawIndex >= len(rawLines) {
		return description, false
	}
	newLine := marker + text
	if rawLines[line.RawIndex] == newLine {
		return description, false
	}
	rawLines[line.RawIndex] = newLine
	return strings.Join(rawLines, "\n"), true
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

	for i, line := range lines {
		var match *model.Subtask
		for _, s := range byText[line.Text] {
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
		newSub := model.Subtask{TaskID: t.ID, Text: line.Text, Position: i}
		if line.DoneHint != nil {
			newSub.Done = *line.DoneHint
		}
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
