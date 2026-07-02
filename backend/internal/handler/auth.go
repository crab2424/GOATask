package handler

import (
	"errors"
	"net/http"
	"regexp"
	"time"

	"github.com/crab2424/goatask/backend/internal/auth"
	"github.com/crab2424/goatask/backend/internal/model"
	"github.com/labstack/echo/v4"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

type AuthHandler struct {
	DB               *gorm.DB
	SignupInviteCode string
}

func NewAuthHandler(db *gorm.DB, signupInviteCode string) *AuthHandler {
	return &AuthHandler{DB: db, SignupInviteCode: signupInviteCode}
}

func (h *AuthHandler) Register(g *echo.Group) {
	g.POST("/auth/login", h.login)
	g.POST("/auth/logout", h.logout)
	g.POST("/auth/register", h.register)
	g.GET("/auth/me", h.me, auth.RequireAuth(h.DB))
}

var usernameRe = regexp.MustCompile(`^[A-Za-z0-9_]{3,32}$`)

type registerReq struct {
	Username   string `json:"username"`
	Password   string `json:"password"`
	InviteCode string `json:"invite_code"`
}

func (h *AuthHandler) register(c echo.Context) error {
	if h.SignupInviteCode == "" {
		return echo.NewHTTPError(http.StatusForbidden, "registration is disabled")
	}
	var req registerReq
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	if req.InviteCode != h.SignupInviteCode {
		return echo.NewHTTPError(http.StatusForbidden, "invalid invite code")
	}
	if !usernameRe.MatchString(req.Username) {
		return echo.NewHTTPError(http.StatusBadRequest, "username must be 3-32 chars of letters, digits, or underscore")
	}
	if len(req.Password) < 8 || len(req.Password) > 72 {
		return echo.NewHTTPError(http.StatusBadRequest, "password must be 8-72 characters")
	}

	var existing int64
	if err := h.DB.Model(&model.User{}).Where("username = ?", req.Username).Count(&existing).Error; err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	if existing > 0 {
		return echo.NewHTTPError(http.StatusConflict, "username already taken")
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	user := model.User{Username: req.Username, PasswordHash: string(hash)}
	if err := h.DB.Create(&user).Error; err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
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
	return c.JSON(http.StatusCreated, map[string]any{"id": user.ID, "username": user.Username})
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
