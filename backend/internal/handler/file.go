package handler

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"net/http"
	"path/filepath"
	"strings"
	"time"

	"github.com/crab2424/goatask/backend/internal/auth"
	"github.com/crab2424/goatask/backend/internal/model"
	"github.com/labstack/echo/v4"
	"gorm.io/gorm"
)

const defaultShareLifetime = 7 * 24 * time.Hour

type FileHandler struct {
	DB          *gorm.DB
	Storage     *ObjectStorage
	MaxFileSize int64
}

func NewFileHandler(db *gorm.DB, storage *ObjectStorage, maxFileSize int64) *FileHandler {
	return &FileHandler{DB: db, Storage: storage, MaxFileSize: maxFileSize}
}

func (h *FileHandler) Register(g *echo.Group) {
	g.GET("/files", h.list)
	g.POST("/files", h.upload)
	g.POST("/files/:id/shares", h.createShare)
	g.DELETE("/files/:id", h.delete)
}

func (h *FileHandler) list(c echo.Context) error {
	var files []model.SharedFile
	if err := h.DB.Where("user_id = ?", auth.UserID(c)).Order("created_at DESC").Find(&files).Error; err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.JSON(http.StatusOK, files)
}

func (h *FileHandler) upload(c echo.Context) error {
	file, err := c.FormFile("file")
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "file is required")
	}
	if file.Size <= 0 || file.Size > h.MaxFileSize {
		return echo.NewHTTPError(http.StatusRequestEntityTooLarge, fmt.Sprintf("file size must be between 1 and %d bytes", h.MaxFileSize))
	}
	contentType := file.Header.Get("Content-Type")
	if contentType == "" {
		contentType = "application/octet-stream"
	}
	filename := sanitizeFilename(file.Filename)
	objectName, err := newObjectName(auth.UserID(c), filename)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	src, err := file.Open()
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "cannot open uploaded file")
	}
	defer src.Close()
	etag, err := h.Storage.Put(c.Request().Context(), objectName, src, file.Size, contentType)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadGateway, "object storage upload failed")
	}
	record := model.SharedFile{UserID: auth.UserID(c), ObjectName: objectName, OriginalFilename: filename, ContentType: contentType, Size: file.Size, ETag: etag}
	if err := h.DB.Create(&record).Error; err != nil {
		_ = h.Storage.Delete(c.Request().Context(), objectName)
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.JSON(http.StatusCreated, record)
}

func (h *FileHandler) createShare(c echo.Context) error {
	file, err := h.ownedFile(c)
	if err != nil {
		return err
	}
	expiresAt := time.Now().UTC().Add(defaultShareLifetime)
	name, err := newObjectName(file.ID, "share")
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	url, err := h.Storage.CreateReadShare(c.Request().Context(), file.ObjectName, expiresAt, name)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadGateway, "could not create share link")
	}
	share := model.FileShare{FileID: file.ID, URL: url, ExpiresAt: expiresAt}
	if err := h.DB.Create(&share).Error; err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.JSON(http.StatusCreated, map[string]any{"id": share.ID, "url": url, "expires_at": expiresAt})
}

func (h *FileHandler) delete(c echo.Context) error {
	file, err := h.ownedFile(c)
	if err != nil {
		return err
	}
	if err := h.Storage.Delete(c.Request().Context(), file.ObjectName); err != nil {
		return echo.NewHTTPError(http.StatusBadGateway, "object storage deletion failed")
	}
	if err := h.DB.Delete(&file).Error; err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.NoContent(http.StatusNoContent)
}

func (h *FileHandler) ownedFile(c echo.Context) (model.SharedFile, error) {
	var file model.SharedFile
	if err := h.DB.Where("id = ? AND user_id = ?", c.Param("id"), auth.UserID(c)).First(&file).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return file, echo.NewHTTPError(http.StatusNotFound, "file not found")
		}
		return file, echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return file, nil
}

func newObjectName(userID uint, filename string) (string, error) {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return fmt.Sprintf("users/%d/%s-%s", userID, hex.EncodeToString(b), filename), nil
}

func sanitizeFilename(filename string) string {
	filename = filepath.Base(filename)
	filename = strings.Map(func(r rune) rune {
		if r < 0x20 || r == 0x7f {
			return -1
		}
		return r
	}, filename)
	filename = strings.TrimSpace(filename)
	if filename == "" || filename == "." || filename == ".." {
		return "unnamed-file"
	}
	return filename
}
