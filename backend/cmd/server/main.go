package main

import (
	"net/http"
	"os"
	"strings"

	"github.com/crab2424/goatask/backend/internal/auth"
	"github.com/crab2424/goatask/backend/internal/config"
	"github.com/crab2424/goatask/backend/internal/db"
	"github.com/crab2424/goatask/backend/internal/handler"
	"github.com/labstack/echo/v4"
	"github.com/labstack/echo/v4/middleware"
)

func main() {
	cfg := config.Load()

	conn, err := db.Connect(cfg)
	if err != nil {
		panic(err)
	}
	if err := db.MigrateAll(conn); err != nil {
		panic(err)
	}

	e := echo.New()
	e.Use(middleware.Logger())
	e.Use(middleware.Recover())
	origins := []string{"http://localhost:5173"}
	if v := os.Getenv("CORS_ORIGINS"); v != "" {
		origins = strings.Split(v, ",")
	}
	e.Use(middleware.CORSWithConfig(middleware.CORSConfig{
		AllowOrigins:     origins,
		AllowMethods:     []string{http.MethodGet, http.MethodPost, http.MethodPut, http.MethodPatch, http.MethodDelete, http.MethodOptions},
		AllowCredentials: true,
	}))

	e.GET("/health", func(c echo.Context) error {
		return c.JSON(http.StatusOK, map[string]string{"status": "ok"})
	})

	api := e.Group("/api")
	handler.NewAuthHandler(conn).Register(api)

	protected := api.Group("", auth.RequireAuth(conn))
	handler.NewTaskHandler(conn).Register(protected)
	handler.NewMemoHandler(conn).Register(protected)
	handler.NewFolderHandler(conn).Register(protected)
	handler.NewDeckHandler(conn).Register(protected)
	handler.NewProjectHandler(conn).Register(protected)
	handler.NewBackupHandler(conn).Register(protected)

	e.Logger.Fatal(e.Start(":" + cfg.AppPort))
}
