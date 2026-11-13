package handler

import (
	"sync"
	"time"
)

const (
	loginMaxFailures = 10
	loginWindow      = 10 * time.Minute
)

// loginLimiter はログイン失敗の回数を「ユーザー名＋接続元IP」ごとに数え、
// 一定時間内に上限を超えたら以降の試行を止める（パスワード総当たり対策）。
// 個人運用の単一プロセス前提なのでメモリ上に持つ。再起動で消えてよい。
type loginLimiter struct {
	mu       sync.Mutex
	failures map[string][]time.Time
	now      func() time.Time
}

func newLoginLimiter() *loginLimiter {
	return &loginLimiter{failures: make(map[string][]time.Time), now: time.Now}
}

// recent は窓の中に残っている失敗時刻だけを返す。
func (l *loginLimiter) recent(key string) []time.Time {
	cutoff := l.now().Add(-loginWindow)
	kept := l.failures[key][:0]
	for _, t := range l.failures[key] {
		if t.After(cutoff) {
			kept = append(kept, t)
		}
	}
	if len(kept) == 0 {
		delete(l.failures, key)
	} else {
		l.failures[key] = kept
	}
	return kept
}

// blocked は上限に達していて試行を受け付けない状態かを返す。
func (l *loginLimiter) blocked(key string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	return len(l.recent(key)) >= loginMaxFailures
}

func (l *loginLimiter) fail(key string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.failures[key] = append(l.recent(key), l.now())
}

func (l *loginLimiter) reset(key string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	delete(l.failures, key)
}
