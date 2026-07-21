package config

import (
	"fmt"
	"os"
)

type Config struct {
	AppPort                   string
	DBHost                    string
	DBPort                    string
	DBUser                    string
	DBPassword                string
	DBName                    string
	StaticDir                 string
	SignupInviteCode          string
	OCIRegion                 string
	OCIObjectStorageNamespace string
	OCIBucketName             string
	OCICompartmentID          string
	OCIAuthMethod             string
	FileMaxBytes              int64
	FileMaxUserBytes          int64
}

func Load() *Config {
	return &Config{
		AppPort:                   getEnv("PORT", getEnv("APP_PORT", "8080")),
		DBHost:                    getEnv("DB_HOST", "localhost"),
		DBPort:                    getEnv("DB_PORT", "5432"),
		DBUser:                    getEnv("DB_USER", "goatask"),
		DBPassword:                getEnv("DB_PASSWORD", "goatask_dev"),
		DBName:                    getEnv("DB_NAME", "goatask"),
		StaticDir:                 getEnv("STATIC_DIR", ""),
		SignupInviteCode:          getEnv("SIGNUP_INVITE_CODE", ""),
		OCIRegion:                 getEnv("OCI_REGION", "ap-tokyo-1"),
		OCIObjectStorageNamespace: getEnv("OCI_OBJECT_STORAGE_NAMESPACE", "nrskptzjyhtw"),
		OCIBucketName:             getEnv("OCI_BUCKET_NAME", "goatask-files"),
		OCICompartmentID:          getEnv("OCI_COMPARTMENT_ID", ""),
		OCIAuthMethod:             getEnv("OCI_AUTH_METHOD", "file"),
		FileMaxBytes:              getInt64Env("FILE_MAX_BYTES", 50*1024*1024),
		FileMaxUserBytes:          getInt64Env("FILE_MAX_USER_BYTES", 500*1024*1024),
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

func getInt64Env(key string, fallback int64) int64 {
	v := os.Getenv(key)
	if v == "" {
		return fallback
	}
	var n int64
	if _, err := fmt.Sscanf(v, "%d", &n); err != nil || n <= 0 {
		return fallback
	}
	return n
}
