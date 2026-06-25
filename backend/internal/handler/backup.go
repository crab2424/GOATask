package handler

import (
	"net/http"
	"time"

	"github.com/crab2424/goatask/backend/internal/model"
	"github.com/labstack/echo/v4"
	"gorm.io/gorm"
)

type BackupHandler struct {
	DB *gorm.DB
}

func NewBackupHandler(db *gorm.DB) *BackupHandler {
	return &BackupHandler{DB: db}
}

func (h *BackupHandler) Register(g *echo.Group) {
	g.GET("/backup/export", h.exportAll)
	g.GET("/backup/export/:scope", h.exportScope)
}

const backupVersion = 1

type backupPayload struct {
	Version    int          `json:"version"`
	ExportedAt time.Time    `json:"exported_at"`
	Scope      string       `json:"scope"`
	Tasks      []model.Task `json:"tasks,omitempty"`
	Subtasks   []model.Subtask `json:"subtasks,omitempty"`
	Projects   []model.Project `json:"projects,omitempty"`
	Memos      []model.Memo   `json:"memos,omitempty"`
	Folders    []model.Folder `json:"folders,omitempty"`
	Decks      []model.Deck   `json:"decks,omitempty"`
	Cards      []model.Card   `json:"cards,omitempty"`
}

func (h *BackupHandler) exportAll(c echo.Context) error {
	p := backupPayload{Version: backupVersion, ExportedAt: time.Now().UTC(), Scope: "all"}
	if err := h.loadTasks(&p); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	if err := h.loadMemos(&p); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	if err := h.loadDecks(&p); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.JSON(http.StatusOK, p)
}

func (h *BackupHandler) exportScope(c echo.Context) error {
	scope := c.Param("scope")
	p := backupPayload{Version: backupVersion, ExportedAt: time.Now().UTC(), Scope: scope}
	switch scope {
	case "tasks":
		if err := h.loadTasks(&p); err != nil {
			return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
		}
	case "memos":
		if err := h.loadMemos(&p); err != nil {
			return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
		}
	case "decks":
		if err := h.loadDecks(&p); err != nil {
			return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
		}
	default:
		return echo.NewHTTPError(http.StatusBadRequest, "invalid scope")
	}
	return c.JSON(http.StatusOK, p)
}

func (h *BackupHandler) loadTasks(p *backupPayload) error {
	if err := h.DB.Order("id ASC").Find(&p.Tasks).Error; err != nil {
		return err
	}
	// Tasks の subtasks フィールドは has-many タグでも Find では取れないので、別途取得
	for i := range p.Tasks {
		p.Tasks[i].Subtasks = nil
	}
	if err := h.DB.Order("id ASC").Find(&p.Subtasks).Error; err != nil {
		return err
	}
	if err := h.DB.Order("id ASC").Find(&p.Projects).Error; err != nil {
		return err
	}
	return nil
}

func (h *BackupHandler) loadMemos(p *backupPayload) error {
	if err := h.DB.Order("id ASC").Find(&p.Memos).Error; err != nil {
		return err
	}
	if err := h.DB.Order("id ASC").Find(&p.Folders).Error; err != nil {
		return err
	}
	return nil
}

func (h *BackupHandler) loadDecks(p *backupPayload) error {
	if err := h.DB.Order("id ASC").Find(&p.Decks).Error; err != nil {
		return err
	}
	for i := range p.Decks {
		p.Decks[i].Cards = nil
	}
	if err := h.DB.Order("id ASC").Find(&p.Cards).Error; err != nil {
		return err
	}
	return nil
}
