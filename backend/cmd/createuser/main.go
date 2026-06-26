package main

import (
	"errors"
	"flag"
	"fmt"
	"os"

	"github.com/crab2424/goatask/backend/internal/config"
	"github.com/crab2424/goatask/backend/internal/db"
	"github.com/crab2424/goatask/backend/internal/model"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

func main() {
	username := flag.String("u", "", "username")
	password := flag.String("p", "", "password")
	flag.Parse()

	if *username == "" || *password == "" {
		fmt.Fprintln(os.Stderr, "usage: createuser -u <username> -p <password>")
		os.Exit(2)
	}

	cfg := config.Load()
	conn, err := db.Connect(cfg)
	if err != nil {
		fmt.Fprintln(os.Stderr, "db connect:", err)
		os.Exit(1)
	}

	var existing model.User
	if err := conn.Where("username = ?", *username).First(&existing).Error; err == nil {
		fmt.Fprintf(os.Stderr, "user %q already exists (id=%d)\n", *username, existing.ID)
		os.Exit(1)
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		fmt.Fprintln(os.Stderr, "lookup user:", err)
		os.Exit(1)
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(*password), bcrypt.DefaultCost)
	if err != nil {
		fmt.Fprintln(os.Stderr, "hash password:", err)
		os.Exit(1)
	}

	u := model.User{Username: *username, PasswordHash: string(hash)}
	if err := conn.Create(&u).Error; err != nil {
		fmt.Fprintln(os.Stderr, "create user:", err)
		os.Exit(1)
	}

	fmt.Printf("created user id=%d username=%s\n", u.ID, u.Username)
}
