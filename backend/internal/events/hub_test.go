package events

import "testing"

// 購読解除と配信が同時に走っても「閉じたチャネルへ送信」でパニックしないこと。
func TestPublishDuringUnsubscribe(t *testing.T) {
	h := NewHub()
	for i := 0; i < 50000; i++ {
		_, unsub := h.Subscribe(1)
		done := make(chan struct{})
		go func() { unsub(); close(done) }()
		h.Publish(1, Event{Kind: "x"})
		<-done
	}
}

func TestPublishDelivers(t *testing.T) {
	h := NewHub()
	ch, unsub := h.Subscribe(1)
	defer unsub()
	h.Publish(1, Event{Kind: "task.updated", ID: 7})
	h.Publish(2, Event{Kind: "other"})
	select {
	case ev := <-ch:
		if ev.Kind != "task.updated" || ev.ID != 7 {
			t.Fatalf("unexpected event: %+v", ev)
		}
	default:
		t.Fatal("event not delivered")
	}
	select {
	case ev := <-ch:
		t.Fatalf("received another user's event: %+v", ev)
	default:
	}
}
