package events

import (
	"sync"
	"sync/atomic"
)

// Event はSSEで配信する変更通知。本文は載せず、種別とIDのみ流す。
// 受信側はEntity単位で必要に応じて個別GETで最新を取得する。
type Event struct {
	Kind     string `json:"kind"`               // 例: "task.updated", "memo.deleted"
	ID       uint   `json:"id,omitempty"`       // 対象エンティティのID
	OriginID string `json:"origin_id,omitempty"` // 送信元クライアントID (X-Client-Id)
}

type subscriber struct {
	id uint64
	ch chan Event
}

// Hub はユーザーID単位のpub/sub。SSEハンドラが購読し、
// 各ミュータブルハンドラがPublishする。
type Hub struct {
	mu     sync.RWMutex
	subs   map[uint][]*subscriber
	nextID atomic.Uint64
}

func NewHub() *Hub {
	return &Hub{subs: make(map[uint][]*subscriber)}
}

// Subscribe は指定ユーザー向けのイベント受信チャネルを返す。
// バッファ32でスロー購読者による他購読者ブロックを避ける。
func (h *Hub) Subscribe(userID uint) (<-chan Event, func()) {
	s := &subscriber{
		id: h.nextID.Add(1),
		ch: make(chan Event, 32),
	}
	h.mu.Lock()
	h.subs[userID] = append(h.subs[userID], s)
	h.mu.Unlock()

	unsub := func() {
		h.mu.Lock()
		defer h.mu.Unlock()
		list := h.subs[userID]
		for i, x := range list {
			if x.id == s.id {
				h.subs[userID] = append(list[:i], list[i+1:]...)
				break
			}
		}
		if len(h.subs[userID]) == 0 {
			delete(h.subs, userID)
		}
		close(s.ch)
	}
	return s.ch, unsub
}

// Publish は該当ユーザーの全購読者にイベントを流す。
// 送信元クライアント(OriginID)には受信側で無視させるため、
// ここではフィルタしない（同一ユーザーの複数タブ含めて全員に配る）。
func (h *Hub) Publish(userID uint, ev Event) {
	h.mu.RLock()
	list := h.subs[userID]
	// スナップショットを取ってから配信し、配信中のロック競合を減らす
	snapshot := make([]*subscriber, len(list))
	copy(snapshot, list)
	h.mu.RUnlock()

	for _, s := range snapshot {
		select {
		case s.ch <- ev:
		default:
			// バッファ満杯なら破棄。受信側は再接続時に画面全体をリロードすればよい。
		}
	}
}
