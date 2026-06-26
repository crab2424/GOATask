package model

import (
	"time"

	"gorm.io/gorm"
)

type TaskStatus string

const (
	TaskStatusTodo TaskStatus = "todo"
	TaskStatusDoing TaskStatus = "doing"
	TaskStatusDone TaskStatus = "done"
)

type Task struct {
	ID          uint           `gorm:"primaryKey" json:"id"`
	UserID      uint           `gorm:"index;not null" json:"user_id"`
	Title       string         `gorm:"not null" json:"title"`
	Description string         `json:"description"`
	Status      TaskStatus     `gorm:"type:varchar(16);default:'todo'" json:"status"`
	Position    int            `gorm:"not null;default:0" json:"position"`
	DueDate     *time.Time     `json:"due_date,omitempty"`
	ProjectID   *uint          `gorm:"index" json:"project_id,omitempty"`
	CreatedAt   time.Time      `json:"created_at"`
	UpdatedAt   time.Time      `json:"updated_at"`
	DeletedAt   gorm.DeletedAt `gorm:"index" json:"-"`
	Subtasks    []Subtask      `gorm:"foreignKey:TaskID;constraint:OnDelete:CASCADE" json:"subtasks"`
}
