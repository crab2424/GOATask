package handler

import (
	"testing"
	"time"
)

func TestLoginLimiter(t *testing.T) {
	now := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	l := newLoginLimiter()
	l.now = func() time.Time { return now }

	for i := 0; i < loginMaxFailures-1; i++ {
		l.fail("a")
	}
	if l.blocked("a") {
		t.Fatal("上限未満で止まっている")
	}
	l.fail("a")
	if !l.blocked("a") {
		t.Fatal("上限に達しても止まらない")
	}
	if l.blocked("b") {
		t.Fatal("別のキーまで止まっている")
	}

	// 窓を過ぎれば再び試せる
	now = now.Add(loginWindow + time.Second)
	if l.blocked("a") {
		t.Fatal("時間が過ぎても止まったまま")
	}

	// 成功でリセット
	for i := 0; i < loginMaxFailures; i++ {
		l.fail("a")
	}
	l.reset("a")
	if l.blocked("a") {
		t.Fatal("リセット後も止まっている")
	}
}
