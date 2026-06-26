package config

import (
	"fmt"
	"os"
)

type Config struct {
	AppPort    string
	DBHost     string
	DBPort     string
	DBUser     string
	DBPassword string
	DBName     string
	StaticDir  string
}

func Load() *Config {
	return &Config{
		AppPort:    getEnv("PORT", getEnv("APP_PORT", "8080")),
		DBHost:     getEnv("DB_HOST", "localhost"),
		DBPort:     getEnv("DB_PORT", "5432"),
		DBUser:     getEnv("DB_USER", "goatask"),
		DBPassword: getEnv("DB_PASSWORD", "goatask_dev"),
		DBName:     getEnv("DB_NAME", "goatask"),
		StaticDir:  getEnv("STATIC_DIR", ""),
	}
}

func (c *Config) DSN() string {
	if url := os.Getenv("DATABASE_URL"); url != "" {
		return url
	}
	return fmt.Sprintf(
		"host=%s user=%s password=%s dbname=%s port=%s sslmode=disable TimeZone=Asia/Tokyo",
		c.DBHost, c.DBUser, c.DBPassword, c.DBName, c.DBPort,
	)
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
