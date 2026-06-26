package handler

import (
	"errors"
	"net/http"
	"time"

	"github.com/crab2424/goatask/backend/internal/auth"
	"github.com/crab2424/goatask/backend/internal/model"
	"github.com/labstack/echo/v4"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

type AuthHandler struct {
	DB *gorm.DB
}

func NewAuthHandler(db *gorm.DB) *AuthHandler {
	return &AuthHandler{DB: db}
}

func (h *AuthHandler) Register(g *echo.Group) {
	g.POST("/auth/login", h.login)
	g.POST("/auth/logout", h.logout)
	g.GET("/auth/me", h.me, auth.RequireAuth(h.DB))
}

type loginReq struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

func (h *AuthHandler) login(c echo.Context) error {
	var req loginReq
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	if req.Username == "" || req.Password == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "username and password required")
	}

	var user model.User
	if err := h.DB.Where("username = ?", req.Username).First(&user).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return echo.NewHTTPError(http.StatusUnauthorized, "invalid credentials")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.Password)); err != nil {
		return echo.NewHTTPError(http.StatusUnauthorized, "invalid credentials")
	}

	sid, err := auth.NewSessionID()
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	expires := time.Now().Add(auth.SessionMaxAge)
	if err := h.DB.Create(&model.Session{ID: sid, UserID: user.ID, ExpiresAt: expires}).Error; err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	auth.SetSessionCookie(c, sid, expires)
	return c.JSON(http.StatusOK, map[string]any{"id": user.ID, "username": user.Username})
}

func (h *AuthHandler) logout(c echo.Context) error {
	cookie, err := c.Cookie(auth.CookieName)
	if err == nil && cookie.Value != "" {
		h.DB.Where("id = ?", cookie.Value).Delete(&model.Session{})
	}
	auth.ClearSessionCookie(c)
	return c.NoContent(http.StatusNoContent)
}

func (h *AuthHandler) me(c echo.Context) error {
	uid := auth.UserID(c)
	var user model.User
	if err := h.DB.First(&user, uid).Error; err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.JSON(http.StatusOK, map[string]any{"id": user.ID, "username": user.Username})
}
