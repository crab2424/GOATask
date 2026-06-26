package auth

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"net/http"
	"os"
	"time"

	"github.com/crab2424/goatask/backend/internal/model"
	"github.com/labstack/echo/v4"
	"gorm.io/gorm"
)

const (
	CookieName     = "goatask_session"
	SessionMaxAge  = 30 * 24 * time.Hour
	contextUserKey = "user_id"
)

func cookieSecure() bool {
	return os.Getenv("COOKIE_SECURE") != "false"
}

// 本番 (Secure=true) では Render の別サブドメイン構成でも Cookie が乗るよう
// SameSite=None。開発 (Secure=false, HTTP) では None が使えないので Lax。
func cookieSameSite() http.SameSite {
	if cookieSecure() {
		return http.SameSiteNoneMode
	}
	return http.SameSiteLaxMode
}

func NewSessionID() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

func SetSessionCookie(c echo.Context, id string, expires time.Time) {
	c.SetCookie(&http.Cookie{
		Name:     CookieName,
		Value:    id,
		Path:     "/",
		HttpOnly: true,
		Secure:   cookieSecure(),
		SameSite: cookieSameSite(),
		Expires:  expires,
	})
}

func ClearSessionCookie(c echo.Context) {
	c.SetCookie(&http.Cookie{
		Name:     CookieName,
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		Secure:   cookieSecure(),
		SameSite: cookieSameSite(),
		MaxAge:   -1,
	})
}

// UserID returns the authenticated user ID set by RequireAuth.
func UserID(c echo.Context) uint {
	v, _ := c.Get(contextUserKey).(uint)
	return v
}

// RequireAuth validates the session cookie and stores the user_id in the context.
func RequireAuth(db *gorm.DB) echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			cookie, err := c.Cookie(CookieName)
			if err != nil || cookie.Value == "" {
				return echo.NewHTTPError(http.StatusUnauthorized, "not authenticated")
			}
			var s model.Session
			if err := db.Where("id = ?", cookie.Value).First(&s).Error; err != nil {
				if errors.Is(err, gorm.ErrRecordNotFound) {
					return echo.NewHTTPError(http.StatusUnauthorized, "invalid session")
				}
				return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
			}
			if time.Now().After(s.ExpiresAt) {
				_ = db.Delete(&s).Error
				return echo.NewHTTPError(http.StatusUnauthorized, "session expired")
			}
			c.Set(contextUserKey, s.UserID)
			return next(c)
		}
	}
}
