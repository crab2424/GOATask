// SSE購読の中核。EventSourceをラップし、
// - タブ非表示時に切断→復帰時に即再接続
// - 指数バックオフで再接続
// - 自分自身が投げた変更(origin_id == 自ID)は無視
// - 全購読者(useServerEvents)にファンアウト
// を担う。アプリ全体で1本のみ張る。
//
// API_BASEを再利用。credentials: "include"はEventSourceの第2引数withCredentialsで指定。

import { API_BASE } from "../../api/client";
import { getClientId } from "./clientId";

export type ServerEvent = {
  kind: string;
  id?: number;
  origin_id?: string;
};

export type ConnectionState = "connecting" | "open" | "closed";

type Listener = (ev: ServerEvent) => void;
type StateListener = (state: ConnectionState) => void;

const KNOWN_EVENT_KINDS = [
  "task", "subtask",
  "memo", "folder",
  "deck", "card",
  "project", "calendar",
  "settings", "file",
];

class ServerEventStream {
  private es: EventSource | null = null;
  private listeners = new Set<Listener>();
  private stateListeners = new Set<StateListener>();
  private state: ConnectionState = "closed";
  private retryDelayMs = 1000;
  private retryTimer: number | null = null;
  private started = false;

  start() {
    if (this.started) return;
    this.started = true;
    document.addEventListener("visibilitychange", this.onVisibilityChange);
    window.addEventListener("online", this.reconnectNow);
    this.connect();
  }

  stop() {
    this.started = false;
    document.removeEventListener("visibilitychange", this.onVisibilityChange);
    window.removeEventListener("online", this.reconnectNow);
    this.disconnect();
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  subscribeState(fn: StateListener): () => void {
    this.stateListeners.add(fn);
    fn(this.state);
    return () => this.stateListeners.delete(fn);
  }

  getState(): ConnectionState {
    return this.state;
  }

  reconnectNow = () => {
    this.retryDelayMs = 1000;
    this.disconnect();
    this.connect();
  };

  private onVisibilityChange = () => {
    if (document.visibilityState === "visible") {
      // バックグラウンドから戻ってきたら即再接続。既存接続がalive/openなら何もしない。
      if (this.state !== "open") this.reconnectNow();
    } else if (document.visibilityState === "hidden") {
      // モバイルはバックグラウンドで通信を切る運用が多いので、送信も受信もいったん止める。
      this.disconnect();
    }
  };

  private setState(next: ConnectionState) {
    if (this.state === next) return;
    this.state = next;
    this.stateListeners.forEach((fn) => fn(next));
  }

  private connect() {
    if (this.es) return;
    if (this.retryTimer !== null) {
      window.clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    this.setState("connecting");

    let es: EventSource;
    try {
      es = new EventSource(`${API_BASE}/api/events`, { withCredentials: true });
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.es = es;

    es.onopen = () => {
      this.retryDelayMs = 1000;
      this.setState("open");
    };
    es.onerror = () => {
      // ネットワーク切断やサーバー再起動などで自動的にここに入る
      this.disconnect();
      this.scheduleReconnect();
    };

    const dispatch = (raw: MessageEvent) => {
      const clientId = getClientId();
      try {
        const data = JSON.parse(raw.data) as ServerEvent;
        if (data.origin_id && data.origin_id === clientId) return;
        this.listeners.forEach((fn) => fn(data));
      } catch {
        // JSONでないメッセージは無視
      }
    };

    // Named eventsを個別に受ける。サーバーはev.Kindごとにevent行を吐いている。
    for (const kind of KNOWN_EVENT_KINDS) {
      for (const action of ["created", "updated", "deleted"]) {
        es.addEventListener(`${kind}.${action}`, dispatch as EventListener);
      }
    }
    // フォールバック（unnamedメッセージが来た場合）
    es.onmessage = dispatch;
  }

  private disconnect() {
    if (this.es) {
      this.es.close();
      this.es = null;
    }
    this.setState("closed");
  }

  private scheduleReconnect() {
    if (!this.started) return;
    if (document.visibilityState === "hidden") return;
    const delay = Math.min(this.retryDelayMs, 30_000);
    this.retryDelayMs = Math.min(this.retryDelayMs * 2, 30_000);
    this.retryTimer = window.setTimeout(() => {
      this.retryTimer = null;
      this.connect();
    }, delay);
  }
}

export const serverEvents = new ServerEventStream();
