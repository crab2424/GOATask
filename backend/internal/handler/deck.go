package handler

import (
	"net/http"
	"strconv"

	"github.com/crab2424/goatask/backend/internal/auth"
	"github.com/crab2424/goatask/backend/internal/model"
	"github.com/labstack/echo/v4"
	"gorm.io/gorm"
)

type DeckHandler struct {
	DB *gorm.DB
}

func NewDeckHandler(db *gorm.DB) *DeckHandler {
	return &DeckHandler{DB: db}
}

func (h *DeckHandler) Register(g *echo.Group) {
	g.GET("/decks", h.list)
	g.POST("/decks", h.create)
	g.GET("/decks/:id", h.get)
	g.PUT("/decks/:id", h.update)
	g.DELETE("/decks/:id", h.delete)

	g.GET("/decks/:id/cards", h.listCards)
	g.POST("/decks/:id/cards", h.createCard)
	g.POST("/decks/:id/cards/import", h.importCards)
	g.POST("/decks/:id/cards/bulk-delete", h.bulkDeleteCards)
	g.PUT("/decks/:id/cards/:cid", h.updateCard)
	g.DELETE("/decks/:id/cards/:cid", h.deleteCard)
	g.PATCH("/decks/:id/cards/:cid/answer", h.answer)
	g.PATCH("/decks/:id/cards/:cid/mark", h.toggleMark)
	g.PATCH("/decks/:id/cards/:cid/reset", h.resetStats)
}

func (h *DeckHandler) ownsDeck(uid uint, deckID int) error {
	var d model.Deck
	if err := h.DB.Select("id").Where("user_id = ?", uid).First(&d, deckID).Error; err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "deck not found")
	}
	return nil
}

func (h *DeckHandler) list(c echo.Context) error {
	uid := auth.UserID(c)
	var decks []model.Deck
	if err := h.DB.Where("user_id = ?", uid).Preload("Cards", func(db *gorm.DB) *gorm.DB {
		return db.Order("id ASC")
	}).Order("updated_at DESC").Find(&decks).Error; err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.JSON(http.StatusOK, decks)
}

func (h *DeckHandler) create(c echo.Context) error {
	uid := auth.UserID(c)
	var d model.Deck
	if err := c.Bind(&d); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	if d.Name == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "name is required")
	}
	d.UserID = uid
	d.Cards = nil
	if err := h.DB.Create(&d).Error; err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.JSON(http.StatusCreated, d)
}

func (h *DeckHandler) get(c echo.Context) error {
	uid := auth.UserID(c)
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid id")
	}
	var d model.Deck
	if err := h.DB.Where("user_id = ?", uid).Preload("Cards", func(db *gorm.DB) *gorm.DB {
		return db.Order("id ASC")
	}).First(&d, id).Error; err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "deck not found")
	}
	return c.JSON(http.StatusOK, d)
}

func (h *DeckHandler) update(c echo.Context) error {
	uid := auth.UserID(c)
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid id")
	}
	var d model.Deck
	if err := h.DB.Where("user_id = ?", uid).First(&d, id).Error; err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "deck not found")
	}
	if err := c.Bind(&d); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	d.UserID = uid
	d.Cards = nil
	if err := h.DB.Save(&d).Error; err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.JSON(http.StatusOK, d)
}

func (h *DeckHandler) delete(c echo.Context) error {
	uid := auth.UserID(c)
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid id")
	}
	var d model.Deck
	if err := h.DB.Where("user_id = ?", uid).First(&d, id).Error; err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "deck not found")
	}
	if err := h.DB.Select("Cards").Delete(&d).Error; err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.NoContent(http.StatusNoContent)
}

func (h *DeckHandler) listCards(c echo.Context) error {
	uid := auth.UserID(c)
	deckID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid id")
	}
	if err := h.ownsDeck(uid, deckID); err != nil {
		return err
	}
	var cards []model.Card
	if err := h.DB.Where("deck_id = ?", deckID).Order("id ASC").Find(&cards).Error; err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.JSON(http.StatusOK, cards)
}

func (h *DeckHandler) createCard(c echo.Context) error {
	uid := auth.UserID(c)
	deckID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid id")
	}
	if err := h.ownsDeck(uid, deckID); err != nil {
		return err
	}
	var card model.Card
	if err := c.Bind(&card); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	if card.Front == "" || card.Back == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "front and back are required")
	}
	card.DeckID = uint(deckID)
	if err := h.DB.Create(&card).Error; err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.JSON(http.StatusCreated, card)
}

type importCardsReq struct {
	Cards []struct {
		Front string `json:"front"`
		Back  string `json:"back"`
	} `json:"cards"`
}

func (h *DeckHandler) importCards(c echo.Context) error {
	uid := auth.UserID(c)
	deckID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid id")
	}
	var req importCardsReq
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	if len(req.Cards) == 0 {
		return echo.NewHTTPError(http.StatusBadRequest, "no cards to import")
	}
	var deck model.Deck
	if err := h.DB.Where("user_id = ?", uid).First(&deck, deckID).Error; err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "deck not found")
	}
	created := make([]model.Card, 0, len(req.Cards))
	err = h.DB.Transaction(func(tx *gorm.DB) error {
		for i, item := range req.Cards {
			if item.Front == "" || item.Back == "" {
				return echo.NewHTTPError(http.StatusBadRequest, "row "+strconv.Itoa(i+1)+": front and back are required")
			}
			card := model.Card{DeckID: uint(deckID), Front: item.Front, Back: item.Back}
			if err := tx.Create(&card).Error; err != nil {
				return err
			}
			created = append(created, card)
		}
		return nil
	})
	if err != nil {
		if he, ok := err.(*echo.HTTPError); ok {
			return he
		}
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.JSON(http.StatusCreated, created)
}

func (h *DeckHandler) updateCard(c echo.Context) error {
	uid := auth.UserID(c)
	deckID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid id")
	}
	cardID, err := strconv.Atoi(c.Param("cid"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid card id")
	}
	if err := h.ownsDeck(uid, deckID); err != nil {
		return err
	}
	var card model.Card
	if err := h.DB.Where("deck_id = ?", deckID).First(&card, cardID).Error; err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "card not found")
	}
	if err := c.Bind(&card); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	card.DeckID = uint(deckID)
	if err := h.DB.Save(&card).Error; err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.JSON(http.StatusOK, card)
}

type bulkDeleteReq struct {
	IDs []uint `json:"ids"`
}

func (h *DeckHandler) bulkDeleteCards(c echo.Context) error {
	uid := auth.UserID(c)
	deckID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid id")
	}
	if err := h.ownsDeck(uid, deckID); err != nil {
		return err
	}
	var req bulkDeleteReq
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	if len(req.IDs) == 0 {
		return c.JSON(http.StatusOK, map[string]int{"deleted": 0})
	}
	res := h.DB.Where("deck_id = ? AND id IN ?", deckID, req.IDs).Delete(&model.Card{})
	if res.Error != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, res.Error.Error())
	}
	return c.JSON(http.StatusOK, map[string]int64{"deleted": res.RowsAffected})
}

func (h *DeckHandler) deleteCard(c echo.Context) error {
	uid := auth.UserID(c)
	deckID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid id")
	}
	cardID, err := strconv.Atoi(c.Param("cid"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid card id")
	}
	if err := h.ownsDeck(uid, deckID); err != nil {
		return err
	}
	if err := h.DB.Where("deck_id = ? AND id = ?", deckID, cardID).Delete(&model.Card{}).Error; err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.NoContent(http.StatusNoContent)
}

type answerReq struct {
	Correct bool `json:"correct"`
}

func (h *DeckHandler) answer(c echo.Context) error {
	uid := auth.UserID(c)
	deckID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid id")
	}
	cardID, err := strconv.Atoi(c.Param("cid"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid card id")
	}
	var req answerReq
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	if err := h.ownsDeck(uid, deckID); err != nil {
		return err
	}
	var card model.Card
	if err := h.DB.Where("deck_id = ?", deckID).First(&card, cardID).Error; err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "card not found")
	}
	if req.Correct {
		card.CorrectCount++
	} else {
		card.WrongCount++
	}
	if err := h.DB.Save(&card).Error; err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.JSON(http.StatusOK, card)
}

type markReq struct {
	Marked bool `json:"marked"`
}

func (h *DeckHandler) toggleMark(c echo.Context) error {
	uid := auth.UserID(c)
	deckID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid id")
	}
	cardID, err := strconv.Atoi(c.Param("cid"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid card id")
	}
	var req markReq
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	if err := h.ownsDeck(uid, deckID); err != nil {
		return err
	}
	var card model.Card
	if err := h.DB.Where("deck_id = ?", deckID).First(&card, cardID).Error; err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "card not found")
	}
	card.Marked = req.Marked
	if err := h.DB.Save(&card).Error; err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.JSON(http.StatusOK, card)
}

func (h *DeckHandler) resetStats(c echo.Context) error {
	uid := auth.UserID(c)
	deckID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid id")
	}
	cardID, err := strconv.Atoi(c.Param("cid"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid card id")
	}
	if err := h.ownsDeck(uid, deckID); err != nil {
		return err
	}
	var card model.Card
	if err := h.DB.Where("deck_id = ?", deckID).First(&card, cardID).Error; err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "card not found")
	}
	card.CorrectCount = 0
	card.WrongCount = 0
	if err := h.DB.Save(&card).Error; err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.JSON(http.StatusOK, card)
}
