// 手動更新ボタン専用の軽量バス。
// SyncIndicatorがrequestRefresh()すると、各Viewが自分の再取得関数をトリガする。
// SSEイベントとは別導線: 「ユーザーが明示的に押したときだけ全画面リフレッシュ」用。

type Listener = () => void;

class RefreshBus {
  private listeners = new Set<Listener>();

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  requestRefresh() {
    this.listeners.forEach((fn) => {
      try { fn(); } catch { /* 個別Viewの例外で他Viewを止めない */ }
    });
  }
}

export const refreshBus = new RefreshBus();
