package main

import (
	"net/http"
	"os"
	"strings"

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

	e := echo.New()
	e.Use(middleware.Logger())
	e.Use(middleware.Recover())
	origins := []string{"http://localhost:5173"}
	if v := os.Getenv("CORS_ORIGINS"); v != "" {
		origins = strings.Split(v, ",")
	}
	e.Use(middleware.CORSWithConfig(middleware.CORSConfig{
		AllowOrigins: origins,
		AllowMethods: []string{http.MethodGet, http.MethodPost, http.MethodPut, http.MethodPatch, http.MethodDelete, http.MethodOptions},
	}))

	e.GET("/health", func(c echo.Context) error {
		return c.JSON(http.StatusOK, map[string]string{"status": "ok"})
	})

	api := e.Group("/api")
	handler.NewTaskHandler(conn).Register(api)
	handler.NewMemoHandler(conn).Register(api)
	handler.NewFolderHandler(conn).Register(api)
	handler.NewDeckHandler(conn).Register(api)
	handler.NewProjectHandler(conn).Register(api)

	e.Logger.Fatal(e.Start(":" + cfg.AppPort))
}
