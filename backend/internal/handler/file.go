package handler

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
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
	MaxUserSize int64
}

func NewFileHandler(db *gorm.DB, storage *ObjectStorage, maxFileSize, maxUserSize int64) *FileHandler {
	return &FileHandler{DB: db, Storage: storage, MaxFileSize: maxFileSize, MaxUserSize: maxUserSize}
}

func (h *FileHandler) Register(g *echo.Group) {
	g.GET("/files", h.list)
	g.POST("/files", h.upload)
	g.POST("/files/:id/shares", h.createShare)
	g.DELETE("/files/:id", h.delete)
}

func (h *FileHandler) list(c echo.Context) error {
	h.revokeExpiredShares()
	var files []model.SharedFile
	if err := h.DB.Where("user_id = ?", auth.UserID(c)).Order("created_at DESC").Find(&files).Error; err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	var used int64
	if err := h.DB.Model(&model.SharedFile{}).Where("user_id = ?", auth.UserID(c)).Select("COALESCE(SUM(size), 0)").Scan(&used).Error; err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.JSON(http.StatusOK, map[string]any{
		"files": files, "used_bytes": used, "max_bytes": h.MaxUserSize,
		"remaining_bytes": maxInt64(0, h.MaxUserSize-used),
	})
}

func (h *FileHandler) upload(c echo.Context) error {
	file, err := c.FormFile("file")
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "file is required")
	}
	if file.Size <= 0 || file.Size > h.MaxFileSize {
		return echo.NewHTTPError(http.StatusRequestEntityTooLarge, fmt.Sprintf("file size must be between 1 and %d bytes", h.MaxFileSize))
	}
	var used int64
	if err := h.DB.Model(&model.SharedFile{}).Where("user_id = ?", auth.UserID(c)).Select("COALESCE(SUM(size), 0)").Scan(&used).Error; err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	if used > h.MaxUserSize-file.Size {
		return echo.NewHTTPError(http.StatusRequestEntityTooLarge, fmt.Sprintf("user storage quota exceeded; remaining bytes: %d", maxInt64(0, h.MaxUserSize-used)))
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
	if err := validateUploadedFile(file, src, contentType); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
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
	h.revokeExpiredShares()
	file, err := h.ownedFile(c)
	if err != nil {
		return err
	}
	expiresAt := time.Now().UTC().Add(defaultShareLifetime)
	name, err := newObjectName(file.ID, "share")
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	url, parID, err := h.Storage.CreateReadShare(c.Request().Context(), file.ObjectName, expiresAt, name)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadGateway, "could not create share link")
	}
	share := model.FileShare{FileID: file.ID, PARID: parID, URL: url, ExpiresAt: expiresAt}
	if err := h.DB.Create(&share).Error; err != nil {
		_ = h.Storage.DeleteReadShare(c.Request().Context(), parID)
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
	var shares []model.FileShare
	if err := h.DB.Where("file_id = ?", file.ID).Find(&shares).Error; err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	for _, share := range shares {
		if err := h.Storage.DeleteReadShare(c.Request().Context(), share.PARID); err != nil {
			return echo.NewHTTPError(http.StatusBadGateway, "shared link revocation failed")
		}
	}
	if err := h.DB.Where("file_id = ?", file.ID).Delete(&model.FileShare{}).Error; err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	if err := h.DB.Delete(&file).Error; err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.NoContent(http.StatusNoContent)
}

func (h *FileHandler) revokeExpiredShares() {
	now := time.Now().UTC()
	_ = h.DB.Model(&model.FileShare{}).
		Where("expires_at <= ? AND revoked_at IS NULL", now).
		Update("revoked_at", now).Error
}

func maxInt64(a, b int64) int64 {
	if a > b {
		return a
	}
	return b
}

func validateUploadedFile(file *multipart.FileHeader, body io.ReadSeeker, declaredType string) error {
	filename := sanitizeFilename(file.Filename)
	ext := strings.ToLower(filepath.Ext(filename))
	if ext == "" {
		return errors.New("file extension is required")
	}
	if blockedFileExtensions[ext] {
		return fmt.Errorf("file type %s is not allowed", ext)
	}
	header := make([]byte, 512)
	n, err := body.Read(header)
	if err != nil && !errors.Is(err, io.EOF) {
		return errors.New("could not inspect uploaded file")
	}
	if _, err := body.Seek(0, io.SeekStart); err != nil {
		return errors.New("could not rewind uploaded file")
	}
	detected := http.DetectContentType(header[:n])
	if !compatibleFileSignature(ext, detected) {
		return fmt.Errorf("file content does not match extension %s (%s)", ext, detected)
	}
	if declaredType != "" && declaredType != "application/octet-stream" && !compatibleDeclaredType(ext, declaredType, detected) {
		return fmt.Errorf("declared MIME type %s does not match file content %s", declaredType, detected)
	}
	return nil
}

var blockedFileExtensions = map[string]bool{
	".app": true, ".bat": true, ".cmd": true, ".com": true, ".dmg": true,
	".exe": true, ".hta": true, ".jar": true, ".js": true, ".msi": true,
	".ps1": true, ".sh": true, ".vbs": true,
}

func compatibleFileSignature(ext, detected string) bool {
	if strings.HasPrefix(detected, "text/") || detected == "application/octet-stream" {
		return true
	}
	switch ext {
	case ".pdf":
		return detected == "application/pdf"
	case ".png":
		return detected == "image/png"
	case ".jpg", ".jpeg":
		return detected == "image/jpeg"
	case ".gif":
		return detected == "image/gif"
	case ".webp":
		return detected == "image/webp"
	case ".zip":
		return detected == "application/zip"
	default:
		return true
	}
}

func compatibleDeclaredType(ext, declared, detected string) bool {
	if strings.HasPrefix(declared, "text/") && strings.HasPrefix(detected, "text/") {
		return true
	}
	if declared == detected {
		return true
	}
	return ext == ".docx" || ext == ".xlsx" || ext == ".pptx"
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
