package handler

import (
	"net/http"
	"strconv"

	"github.com/crab2424/goatask/backend/internal/model"
	"github.com/labstack/echo/v4"
	"gorm.io/gorm"
)

type ProjectHandler struct {
	DB *gorm.DB
}

func NewProjectHandler(db *gorm.DB) *ProjectHandler {
	return &ProjectHandler{DB: db}
}

func (h *ProjectHandler) Register(g *echo.Group) {
	g.GET("/projects", h.list)
	g.POST("/projects", h.create)
	g.PUT("/projects/:id", h.update)
	g.DELETE("/projects/:id", h.delete)
}

func (h *ProjectHandler) list(c echo.Context) error {
	var projects []model.Project
	if err := h.DB.Order("name ASC").Find(&projects).Error; err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.JSON(http.StatusOK, projects)
}

func (h *ProjectHandler) create(c echo.Context) error {
	var p model.Project
	if err := c.Bind(&p); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	if p.Name == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "name is required")
	}
	if p.ParentID != nil {
		var parent model.Project
		if err := h.DB.First(&parent, *p.ParentID).Error; err != nil {
			return echo.NewHTTPError(http.StatusBadRequest, "parent project not found")
		}
		d, err := projectDepth(h.DB, *p.ParentID)
		if err != nil {
			return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
		}
		if d+1 >= maxNestingDepth {
			return echo.NewHTTPError(http.StatusBadRequest, "これ以上深い階層は作成できません")
		}
	}
	if err := h.DB.Create(&p).Error; err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.JSON(http.StatusCreated, p)
}

func (h *ProjectHandler) update(c echo.Context) error {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid id")
	}
	var p model.Project
	if err := h.DB.First(&p, id).Error; err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "project not found")
	}
	if err := c.Bind(&p); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	if p.Name == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "name is required")
	}
	if p.ParentID != nil {
		if *p.ParentID == uint(id) {
			return echo.NewHTTPError(http.StatusBadRequest, "parent cannot be self")
		}
		if cycle, err := wouldCreateProjectCycle(h.DB, uint(id), *p.ParentID); err != nil {
			return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
		} else if cycle {
			return echo.NewHTTPError(http.StatusBadRequest, "parent would create a cycle")
		}
		parentD, err := projectDepth(h.DB, *p.ParentID)
		if err != nil {
			return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
		}
		subtreeD, err := projectSubtreeMaxDepth(h.DB, uint(id))
		if err != nil {
			return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
		}
		if parentD+1+subtreeD >= maxNestingDepth {
			return echo.NewHTTPError(http.StatusBadRequest, "移動先では階層が深くなりすぎます")
		}
	}
	if err := h.DB.Save(&p).Error; err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.JSON(http.StatusOK, p)
}

func (h *ProjectHandler) delete(c echo.Context) error {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid id")
	}
	var p model.Project
	if err := h.DB.First(&p, id).Error; err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "project not found")
	}
	tx := h.DB.Begin()
	if tx.Error != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, tx.Error.Error())
	}
	if err := tx.Model(&model.Project{}).Where("parent_id = ?", p.ID).
		Update("parent_id", p.ParentID).Error; err != nil {
		tx.Rollback()
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	if err := tx.Model(&model.Task{}).Where("project_id = ?", p.ID).
		Update("project_id", nil).Error; err != nil {
		tx.Rollback()
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	if err := tx.Delete(&p).Error; err != nil {
		tx.Rollback()
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	if err := tx.Commit().Error; err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.NoContent(http.StatusNoContent)
}

func wouldCreateProjectCycle(db *gorm.DB, projectID, newParentID uint) (bool, error) {
	current := &newParentID
	for current != nil {
		if *current == projectID {
			return true, nil
		}
		var parent model.Project
		if err := db.Select("id", "parent_id").First(&parent, *current).Error; err != nil {
			return false, err
		}
		current = parent.ParentID
	}
	return false, nil
}

func projectDepth(db *gorm.DB, id uint) (int, error) {
	depth := 0
	currentID := id
	for {
		var p model.Project
		if err := db.Select("id", "parent_id").First(&p, currentID).Error; err != nil {
			return 0, err
		}
		if p.ParentID == nil {
			return depth, nil
		}
		depth++
		currentID = *p.ParentID
	}
}

func projectSubtreeMaxDepth(db *gorm.DB, id uint) (int, error) {
	var children []model.Project
	if err := db.Where("parent_id = ?", id).Find(&children).Error; err != nil {
		return 0, err
	}
	maxD := 0
	for _, c := range children {
		d, err := projectSubtreeMaxDepth(db, c.ID)
		if err != nil {
			return 0, err
		}
		if d+1 > maxD {
			maxD = d + 1
		}
	}
	return maxD, nil
}
