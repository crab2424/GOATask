package handler

import (
	"fmt"
	"net/http"
	"os"
	"time"

	"github.com/crab2424/goatask/backend/internal/model"
	"github.com/labstack/echo/v4"
	"gorm.io/gorm"
)

type BackupHandler struct {
	DB *gorm.DB
}

func NewBackupHandler(db *gorm.DB) *BackupHandler {
	return &BackupHandler{DB: db}
}

func (h *BackupHandler) Register(g *echo.Group) {
	g.GET("/backup/export", h.exportAll)
	g.GET("/backup/export/:scope", h.exportScope)
	g.POST("/backup/import", h.importData, requireBackupToken)
}

const backupVersion = 1

type backupPayload struct {
	Version    int             `json:"version"`
	ExportedAt time.Time       `json:"exported_at"`
	Scope      string          `json:"scope"`
	Tasks      []model.Task    `json:"tasks,omitempty"`
	Subtasks   []model.Subtask `json:"subtasks,omitempty"`
	Projects   []model.Project `json:"projects,omitempty"`
	Memos      []model.Memo    `json:"memos,omitempty"`
	Folders    []model.Folder  `json:"folders,omitempty"`
	Decks      []model.Deck    `json:"decks,omitempty"`
	Cards      []model.Card    `json:"cards,omitempty"`
}

// ----- export -----

func (h *BackupHandler) exportAll(c echo.Context) error {
	p := backupPayload{Version: backupVersion, ExportedAt: time.Now().UTC(), Scope: "all"}
	if err := h.loadTasks(&p); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	if err := h.loadMemos(&p); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	if err := h.loadDecks(&p); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.JSON(http.StatusOK, p)
}

func (h *BackupHandler) exportScope(c echo.Context) error {
	scope := c.Param("scope")
	p := backupPayload{Version: backupVersion, ExportedAt: time.Now().UTC(), Scope: scope}
	switch scope {
	case "tasks":
		if err := h.loadTasks(&p); err != nil {
			return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
		}
	case "memos":
		if err := h.loadMemos(&p); err != nil {
			return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
		}
	case "decks":
		if err := h.loadDecks(&p); err != nil {
			return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
		}
	default:
		return echo.NewHTTPError(http.StatusBadRequest, "invalid scope")
	}
	return c.JSON(http.StatusOK, p)
}

func (h *BackupHandler) loadTasks(p *backupPayload) error {
	if err := h.DB.Order("id ASC").Find(&p.Tasks).Error; err != nil {
		return err
	}
	for i := range p.Tasks {
		p.Tasks[i].Subtasks = nil
	}
	if err := h.DB.Order("id ASC").Find(&p.Subtasks).Error; err != nil {
		return err
	}
	if err := h.DB.Order("id ASC").Find(&p.Projects).Error; err != nil {
		return err
	}
	return nil
}

func (h *BackupHandler) loadMemos(p *backupPayload) error {
	if err := h.DB.Order("id ASC").Find(&p.Memos).Error; err != nil {
		return err
	}
	if err := h.DB.Order("id ASC").Find(&p.Folders).Error; err != nil {
		return err
	}
	return nil
}

func (h *BackupHandler) loadDecks(p *backupPayload) error {
	if err := h.DB.Order("id ASC").Find(&p.Decks).Error; err != nil {
		return err
	}
	for i := range p.Decks {
		p.Decks[i].Cards = nil
	}
	if err := h.DB.Order("id ASC").Find(&p.Cards).Error; err != nil {
		return err
	}
	return nil
}

// ----- token middleware -----

func requireBackupToken(next echo.HandlerFunc) echo.HandlerFunc {
	return func(c echo.Context) error {
		expected := os.Getenv("BACKUP_TOKEN")
		if expected == "" {
			return next(c)
		}
		got := c.Request().Header.Get("X-Backup-Token")
		if got != expected {
			return echo.NewHTTPError(http.StatusUnauthorized, "invalid backup token")
		}
		return next(c)
	}
}

// ----- import -----

type importRequest struct {
	Mode string         `json:"mode"`
	Data backupPayload  `json:"data"`
}

type importResult struct {
	Mode     string         `json:"mode"`
	Scope    string         `json:"scope"`
	Inserted map[string]int `json:"inserted"`
}

func (h *BackupHandler) importData(c echo.Context) error {
	var req importRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	if req.Data.Version != backupVersion {
		return echo.NewHTTPError(http.StatusBadRequest, fmt.Sprintf("unsupported version: %d", req.Data.Version))
	}
	scope := req.Data.Scope
	if scope == "" {
		scope = "all"
	}

	res := importResult{Mode: req.Mode, Scope: scope, Inserted: map[string]int{}}

	err := h.DB.Transaction(func(tx *gorm.DB) error {
		switch req.Mode {
		case "replace":
			return h.replaceImport(tx, &req.Data, scope, res.Inserted)
		case "merge":
			return h.mergeImport(tx, &req.Data, scope, res.Inserted)
		default:
			return echo.NewHTTPError(http.StatusBadRequest, "mode must be 'replace' or 'merge'")
		}
	})
	if err != nil {
		if _, ok := err.(*echo.HTTPError); ok {
			return err
		}
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.JSON(http.StatusOK, res)
}

// ----- replace mode -----

// scopeTables: テーブル名のリスト（truncate順 = 子→親）
var scopeTables = map[string][]string{
	"tasks":  {"subtasks", "tasks", "projects"},
	"memos":  {"memos", "folders"},
	"decks":  {"cards", "decks"},
	"all":    {"subtasks", "tasks", "projects", "memos", "folders", "cards", "decks"},
}

func (h *BackupHandler) replaceImport(tx *gorm.DB, p *backupPayload, scope string, ins map[string]int) error {
	tables, ok := scopeTables[scope]
	if !ok {
		return fmt.Errorf("unknown scope: %s", scope)
	}
	// truncate (RESTART IDENTITY CASCADE で sequence もリセット)
	for _, t := range tables {
		if err := tx.Exec(fmt.Sprintf("TRUNCATE TABLE %s RESTART IDENTITY CASCADE", t)).Error; err != nil {
			return err
		}
	}
	// 元IDのまま投入。GORM の Create はゼロでない ID をそのまま使う
	if needsScope(scope, "tasks") {
		if err := insertWithIDs(tx, p.Projects); err != nil {
			return err
		}
		ins["projects"] = len(p.Projects)
		if err := insertWithIDs(tx, p.Tasks); err != nil {
			return err
		}
		ins["tasks"] = len(p.Tasks)
		if err := insertWithIDs(tx, p.Subtasks); err != nil {
			return err
		}
		ins["subtasks"] = len(p.Subtasks)
	}
	if needsScope(scope, "memos") {
		if err := insertWithIDs(tx, p.Folders); err != nil {
			return err
		}
		ins["folders"] = len(p.Folders)
		if err := insertWithIDs(tx, p.Memos); err != nil {
			return err
		}
		ins["memos"] = len(p.Memos)
	}
	if needsScope(scope, "decks") {
		if err := insertWithIDs(tx, p.Decks); err != nil {
			return err
		}
		ins["decks"] = len(p.Decks)
		if err := insertWithIDs(tx, p.Cards); err != nil {
			return err
		}
		ins["cards"] = len(p.Cards)
	}
	// sequence を MAX(id)+1 に setval（明示IDで挿入したので必要）
	for _, t := range tables {
		seq := t + "_id_seq"
		// COALESCE で 空テーブル時に setval(1) になるよう調整
		q := fmt.Sprintf("SELECT setval('%s', COALESCE((SELECT MAX(id) FROM %s), 1), (SELECT COUNT(*) FROM %s) > 0)", seq, t, t)
		if err := tx.Exec(q).Error; err != nil {
			return err
		}
	}
	return nil
}

func needsScope(scope, want string) bool {
	return scope == "all" || scope == want
}

// insertWithIDs は generics で各モデルのスライスを挿入する
func insertWithIDs[T any](tx *gorm.DB, rows []T) error {
	if len(rows) == 0 {
		return nil
	}
	// CreateInBatches で大量データにも耐える
	return tx.Session(&gorm.Session{FullSaveAssociations: false}).CreateInBatches(rows, 200).Error
}

// ----- merge mode -----

func (h *BackupHandler) mergeImport(tx *gorm.DB, p *backupPayload, scope string, ins map[string]int) error {
	// 親系のマッピング (oldID -> newID)
	projectMap := map[uint]uint{}
	folderMap := map[uint]uint{}
	deckMap := map[uint]uint{}
	taskMap := map[uint]uint{}

	if needsScope(scope, "tasks") {
		if err := mergeProjects(tx, p.Projects, projectMap); err != nil {
			return err
		}
		ins["projects"] = len(projectMap)
		if err := mergeTasks(tx, p.Tasks, projectMap, taskMap); err != nil {
			return err
		}
		ins["tasks"] = len(taskMap)
		if err := mergeSubtasks(tx, p.Subtasks, taskMap); err != nil {
			return err
		}
		ins["subtasks"] = len(p.Subtasks)
	}
	if needsScope(scope, "memos") {
		if err := mergeFolders(tx, p.Folders, folderMap); err != nil {
			return err
		}
		ins["folders"] = len(folderMap)
		if err := mergeMemos(tx, p.Memos, folderMap); err != nil {
			return err
		}
		ins["memos"] = len(p.Memos)
	}
	if needsScope(scope, "decks") {
		if err := mergeDecks(tx, p.Decks, deckMap); err != nil {
			return err
		}
		ins["decks"] = len(deckMap)
		if err := mergeCards(tx, p.Cards, deckMap); err != nil {
			return err
		}
		ins["cards"] = len(p.Cards)
	}
	return nil
}

// 自己参照を持つ親系（Project/Folder）は parent_id の依存順に処理する
func mergeProjects(tx *gorm.DB, items []model.Project, m map[uint]uint) error {
	pending := append([]model.Project(nil), items...)
	for len(pending) > 0 {
		progressed := false
		next := pending[:0]
		for _, it := range pending {
			parentID := it.ParentID
			if parentID != nil {
				if mapped, ok := m[*parentID]; ok {
					p := mapped
					parentID = &p
				} else {
					next = append(next, it)
					continue
				}
			}
			// 既存マッチ：name + parent_id
			var existing model.Project
			q := tx.Where("name = ?", it.Name)
			if parentID == nil {
				q = q.Where("parent_id IS NULL")
			} else {
				q = q.Where("parent_id = ?", *parentID)
			}
			err := q.First(&existing).Error
			if err == nil {
				m[it.ID] = existing.ID
				progressed = true
				continue
			}
			if err != gorm.ErrRecordNotFound {
				return err
			}
			// 新規作成
			newRow := model.Project{Name: it.Name, ParentID: parentID}
			if err := tx.Create(&newRow).Error; err != nil {
				return err
			}
			m[it.ID] = newRow.ID
			progressed = true
		}
		if !progressed {
			// 親が見つからない孤児 → ルート扱いで作る
			for _, it := range next {
				newRow := model.Project{Name: it.Name, ParentID: nil}
				if err := tx.Create(&newRow).Error; err != nil {
					return err
				}
				m[it.ID] = newRow.ID
			}
			return nil
		}
		pending = next
	}
	return nil
}

func mergeFolders(tx *gorm.DB, items []model.Folder, m map[uint]uint) error {
	pending := append([]model.Folder(nil), items...)
	for len(pending) > 0 {
		progressed := false
		next := pending[:0]
		for _, it := range pending {
			parentID := it.ParentID
			if parentID != nil {
				if mapped, ok := m[*parentID]; ok {
					p := mapped
					parentID = &p
				} else {
					next = append(next, it)
					continue
				}
			}
			var existing model.Folder
			q := tx.Where("name = ?", it.Name)
			if parentID == nil {
				q = q.Where("parent_id IS NULL")
			} else {
				q = q.Where("parent_id = ?", *parentID)
			}
			err := q.First(&existing).Error
			if err == nil {
				m[it.ID] = existing.ID
				progressed = true
				continue
			}
			if err != gorm.ErrRecordNotFound {
				return err
			}
			newRow := model.Folder{Name: it.Name, ParentID: parentID}
			if err := tx.Create(&newRow).Error; err != nil {
				return err
			}
			m[it.ID] = newRow.ID
			progressed = true
		}
		if !progressed {
			for _, it := range next {
				newRow := model.Folder{Name: it.Name, ParentID: nil}
				if err := tx.Create(&newRow).Error; err != nil {
					return err
				}
				m[it.ID] = newRow.ID
			}
			return nil
		}
		pending = next
	}
	return nil
}

func mergeDecks(tx *gorm.DB, items []model.Deck, m map[uint]uint) error {
	for _, it := range items {
		var existing model.Deck
		err := tx.Where("name = ?", it.Name).First(&existing).Error
		if err == nil {
			m[it.ID] = existing.ID
			continue
		}
		if err != gorm.ErrRecordNotFound {
			return err
		}
		newRow := model.Deck{Name: it.Name}
		if err := tx.Create(&newRow).Error; err != nil {
			return err
		}
		m[it.ID] = newRow.ID
	}
	return nil
}

func mergeTasks(tx *gorm.DB, items []model.Task, projectMap, taskMap map[uint]uint) error {
	for _, it := range items {
		var projectID *uint
		if it.ProjectID != nil {
			if mapped, ok := projectMap[*it.ProjectID]; ok {
				p := mapped
				projectID = &p
			}
		}
		newRow := model.Task{
			Title:       it.Title,
			Description: it.Description,
			Status:      it.Status,
			Position:    it.Position,
			DueDate:     it.DueDate,
			ProjectID:   projectID,
		}
		if err := tx.Create(&newRow).Error; err != nil {
			return err
		}
		taskMap[it.ID] = newRow.ID
	}
	return nil
}

func mergeSubtasks(tx *gorm.DB, items []model.Subtask, taskMap map[uint]uint) error {
	for _, it := range items {
		newTaskID, ok := taskMap[it.TaskID]
		if !ok {
			// 親タスクが今回のスナップショットに無いのでスキップ
			continue
		}
		newRow := model.Subtask{
			TaskID:   newTaskID,
			Text:     it.Text,
			Done:     it.Done,
			Position: it.Position,
		}
		if err := tx.Create(&newRow).Error; err != nil {
			return err
		}
	}
	return nil
}

func mergeMemos(tx *gorm.DB, items []model.Memo, folderMap map[uint]uint) error {
	for _, it := range items {
		var folderID *uint
		if it.FolderID != nil {
			if mapped, ok := folderMap[*it.FolderID]; ok {
				p := mapped
				folderID = &p
			}
		}
		newRow := model.Memo{
			Title:    it.Title,
			Content:  it.Content,
			FolderID: folderID,
			Position: it.Position,
			Color:    it.Color,
			FontSize: it.FontSize,
		}
		if err := tx.Create(&newRow).Error; err != nil {
			return err
		}
	}
	return nil
}

func mergeCards(tx *gorm.DB, items []model.Card, deckMap map[uint]uint) error {
	for _, it := range items {
		newDeckID, ok := deckMap[it.DeckID]
		if !ok {
			continue
		}
		newRow := model.Card{
			DeckID:       newDeckID,
			Front:        it.Front,
			Back:         it.Back,
			Marked:       it.Marked,
			CorrectCount: it.CorrectCount,
			WrongCount:   it.WrongCount,
		}
		if err := tx.Create(&newRow).Error; err != nil {
			return err
		}
	}
	return nil
}
