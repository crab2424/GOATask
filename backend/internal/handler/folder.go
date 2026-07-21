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

const maxNestingDepth = 10

type FolderHandler struct {
	DB  *gorm.DB
	Hub *events.Hub
}

func NewFolderHandler(db *gorm.DB, hub *events.Hub) *FolderHandler {
	return &FolderHandler{DB: db, Hub: hub}
}

func (h *FolderHandler) Register(g *echo.Group) {
	g.GET("/folders", h.list)
	g.POST("/folders", h.create)
	g.PUT("/folders/:id", h.update)
	g.DELETE("/folders/:id", h.delete)
}

func (h *FolderHandler) list(c echo.Context) error {
	uid := auth.UserID(c)
	var folders []model.Folder
	if err := h.DB.Where("user_id = ?", uid).Order("name ASC").Find(&folders).Error; err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.JSON(http.StatusOK, folders)
}

func (h *FolderHandler) create(c echo.Context) error {
	uid := auth.UserID(c)
	var f model.Folder
	if err := c.Bind(&f); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	if f.Name == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "name is required")
	}
	if f.ParentID != nil {
		var parent model.Folder
		if err := h.DB.Where("user_id = ?", uid).First(&parent, *f.ParentID).Error; err != nil {
			return echo.NewHTTPError(http.StatusBadRequest, "parent folder not found")
		}
		d, err := folderDepth(h.DB, *f.ParentID)
		if err != nil {
			return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
		}
		if d+1 >= maxNestingDepth {
			return echo.NewHTTPError(http.StatusBadRequest, "これ以上深い階層は作成できません")
		}
	}
	f.UserID = uid
	if err := h.DB.Create(&f).Error; err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	publish(h.Hub, uid, "folder.created", f.ID, originID(c))
	return c.JSON(http.StatusCreated, f)
}

func (h *FolderHandler) update(c echo.Context) error {
	uid := auth.UserID(c)
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid id")
	}
	var f model.Folder
	if err := h.DB.Where("user_id = ?", uid).First(&f, id).Error; err != nil {
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
		var parent model.Folder
		if err := h.DB.Where("user_id = ?", uid).First(&parent, *f.ParentID).Error; err != nil {
			return echo.NewHTTPError(http.StatusBadRequest, "parent folder not found")
		}
		if cycle, err := wouldCreateCycle(h.DB, uint(id), *f.ParentID); err != nil {
			return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
		} else if cycle {
			return echo.NewHTTPError(http.StatusBadRequest, "parent would create a cycle")
		}
		parentD, err := folderDepth(h.DB, *f.ParentID)
		if err != nil {
			return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
		}
		subtreeD, err := folderSubtreeMaxDepth(h.DB, uint(id))
		if err != nil {
			return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
		}
		if parentD+1+subtreeD >= maxNestingDepth {
			return echo.NewHTTPError(http.StatusBadRequest, "移動先では階層が深くなりすぎます")
		}
	}
	f.UserID = uid
	if err := h.DB.Save(&f).Error; err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	publish(h.Hub, uid, "folder.updated", f.ID, originID(c))
	return c.JSON(http.StatusOK, f)
}

// delete removes a folder. Child folders are reparented to this folder's
// parent (so they bubble up one level). Memos in this folder have their
// folder_id cleared so they appear in the "未分類" group.
func (h *FolderHandler) delete(c echo.Context) error {
	uid := auth.UserID(c)
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid id")
	}
	var f model.Folder
	if err := h.DB.Where("user_id = ?", uid).First(&f, id).Error; err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "folder not found")
	}
	var req struct{ MoveTo string `json:"move_to"` }
	_ = c.Bind(&req)
	if req.MoveTo == "" { req.MoveTo = "unassigned" }
	if req.MoveTo != "parent" && req.MoveTo != "unassigned" {
		return echo.NewHTTPError(http.StatusBadRequest, "move_to must be 'parent' or 'unassigned'")
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
	var destination interface{} = nil
	if req.MoveTo == "parent" { destination = f.ParentID }
	if err := tx.Model(&model.Memo{}).Where("folder_id = ?", f.ID).
		Update("folder_id", destination).Error; err != nil {
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
	// フォルダ削除は子フォルダとメモの所属も動くので、両方のリスナに通知する。
	origin := originID(c)
	publish(h.Hub, uid, "folder.deleted", f.ID, origin)
	publish(h.Hub, uid, "memo.updated", 0, origin)
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

func folderDepth(db *gorm.DB, id uint) (int, error) {
	depth := 0
	currentID := id
	for {
		var f model.Folder
		if err := db.Select("id", "parent_id").First(&f, currentID).Error; err != nil {
			return 0, err
		}
		if f.ParentID == nil {
			return depth, nil
		}
		depth++
		currentID = *f.ParentID
	}
}

func folderSubtreeMaxDepth(db *gorm.DB, id uint) (int, error) {
	var children []model.Folder
	if err := db.Where("parent_id = ?", id).Find(&children).Error; err != nil {
		return 0, err
	}
	maxD := 0
	for _, c := range children {
		d, err := folderSubtreeMaxDepth(db, c.ID)
		if err != nil {
			return 0, err
		}
		if d+1 > maxD {
			maxD = d + 1
		}
	}
	return maxD, nil
}
