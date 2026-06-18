package handler

import (
	"net/http"
	"strconv"

	"github.com/crab2424/goatask/backend/internal/model"
	"github.com/labstack/echo/v4"
	"gorm.io/gorm"
)

type FolderHandler struct {
	DB *gorm.DB
}

func NewFolderHandler(db *gorm.DB) *FolderHandler {
	return &FolderHandler{DB: db}
}

func (h *FolderHandler) Register(g *echo.Group) {
	g.GET("/folders", h.list)
	g.POST("/folders", h.create)
	g.PUT("/folders/:id", h.update)
	g.DELETE("/folders/:id", h.delete)
}

func (h *FolderHandler) list(c echo.Context) error {
	var folders []model.Folder
	if err := h.DB.Order("name ASC").Find(&folders).Error; err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.JSON(http.StatusOK, folders)
}

func (h *FolderHandler) create(c echo.Context) error {
	var f model.Folder
	if err := c.Bind(&f); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	if f.Name == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "name is required")
	}
	if f.ParentID != nil {
		var parent model.Folder
		if err := h.DB.First(&parent, *f.ParentID).Error; err != nil {
			return echo.NewHTTPError(http.StatusBadRequest, "parent folder not found")
		}
	}
	if err := h.DB.Create(&f).Error; err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.JSON(http.StatusCreated, f)
}

func (h *FolderHandler) update(c echo.Context) error {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid id")
	}
	var f model.Folder
	if err := h.DB.First(&f, id).Error; err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "folder not found")
	}
	if err := c.Bind(&f); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	if f.Name == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "name is required")
	}
	if f.ParentID != nil {
		if *f.ParentID == uint(id) {
			return echo.NewHTTPError(http.StatusBadRequest, "parent cannot be self")
		}
		if cycle, err := wouldCreateCycle(h.DB, uint(id), *f.ParentID); err != nil {
			return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
		} else if cycle {
			return echo.NewHTTPError(http.StatusBadRequest, "parent would create a cycle")
		}
	}
	if err := h.DB.Save(&f).Error; err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.JSON(http.StatusOK, f)
}

// delete removes a folder. Child folders are reparented to this folder's
// parent (so they bubble up one level). Memos in this folder have their
// folder_id cleared so they appear in the "未分類" group.
func (h *FolderHandler) delete(c echo.Context) error {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid id")
	}
	var f model.Folder
	if err := h.DB.First(&f, id).Error; err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "folder not found")
	}
	tx := h.DB.Begin()
	if tx.Error != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, tx.Error.Error())
	}
	if err := tx.Model(&model.Folder{}).Where("parent_id = ?", f.ID).
		Update("parent_id", f.ParentID).Error; err != nil {
		tx.Rollback()
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	if err := tx.Model(&model.Memo{}).Where("folder_id = ?", f.ID).
		Update("folder_id", nil).Error; err != nil {
		tx.Rollback()
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	if err := tx.Delete(&f).Error; err != nil {
		tx.Rollback()
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	if err := tx.Commit().Error; err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.NoContent(http.StatusNoContent)
}

// wouldCreateCycle returns true if making newParentID the parent of folderID
// would form a cycle (i.e. newParentID is folderID or any of its descendants).
func wouldCreateCycle(db *gorm.DB, folderID, newParentID uint) (bool, error) {
	current := &newParentID
	for current != nil {
		if *current == folderID {
			return true, nil
		}
		var parent model.Folder
		if err := db.Select("id", "parent_id").First(&parent, *current).Error; err != nil {
			return false, err
		}
		current = parent.ParentID
	}
	return false, nil
}
