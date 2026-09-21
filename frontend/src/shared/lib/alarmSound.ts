/**
 * 通知音の再生（Web Audio API）。
 *
 * ブラウザは「ユーザー操作なしの音声再生」をブロックする（特にSafari）。
 * そこで最初のクリック/キー入力で AudioContext を起動しておき、以降はその
 * コンテキストで鳴らす。起動前に鳴らそうとした場合は false を返し、呼び出し側が
 * 「ブロックされた」旨を表示する。
 */
const SOUND_URL = "/sounds/alarm.wav";
/** 止め忘れても鳴り続けないよう、この時間で自動停止する */
const MAX_RING_MS = 60 * 1000;

let ctx: AudioContext | null = null;
let buffer: AudioBuffer | null = null;
let loading: Promise<AudioBuffer | null> | null = null;
let current: { source: AudioBufferSourceNode; timer: number } | null = null;

function getContext(): AudioContext | null {
  if (ctx) return ctx;
  if (typeof window === "undefined" || !("AudioContext" in window)) return null;
  ctx = new AudioContext();
  return ctx;
}

function loadBuffer(context: AudioContext): Promise<AudioBuffer | null> {
  if (buffer) return Promise.resolve(buffer);
  loading ??= fetch(SOUND_URL)
    .then((res) => res.arrayBuffer())
    .then((data) => context.decodeAudioData(data))
    .then((decoded) => (buffer = decoded))
    .catch(() => {
      loading = null;
      return null;
    });
  return loading;
}

/** 最初のユーザー操作で AudioContext を起動する。戻り値は解除関数。 */
export function installAudioUnlock(): () => void {
  const unlock = () => {
    const context = getContext();
    if (!context) return;
    void loadBuffer(context);
    void context.resume().then(() => {
      if (context.state === "running") remove();
    });
  };
  const remove = () => {
    window.removeEventListener("pointerdown", unlock, true);
    window.removeEventListener("keydown", unlock, true);
  };
  window.addEventListener("pointerdown", unlock, true);
  window.addEventListener("keydown", unlock, true);
  return remove;
}

/**
 * 通知音をループ再生する（stopAlarmSound か 60秒で停止）。
 * 実際に鳴らせたら true、ブロック等で鳴らせなければ false。
 */
export async function playAlarmSound(): Promise<boolean> {
  const context = getContext();
  if (!context) return false;
  if (context.state !== "running") {
    // ユーザー操作なしの resume はブラウザによって保留されたままになるため、短時間で見切る
    await Promise.race([context.resume().catch(() => undefined), new Promise((r) => setTimeout(r, 300))]);
    // await 後に状態が変わっていることがあるため、絞り込み済みの型を読み直す
    if ((context.state as AudioContextState) !== "running") return false;
  }
  const decoded = await loadBuffer(context);
  if (!decoded) return false;
  stopAlarmSound();
  const source = context.createBufferSource();
  source.buffer = decoded;
  source.loop = true;
  source.connect(context.destination);
  source.start();
  const timer = window.setTimeout(stopAlarmSound, MAX_RING_MS);
  current = { source, timer };
  return true;
}

export function stopAlarmSound() {
  if (!current) return;
  window.clearTimeout(current.timer);
  try {
    current.source.stop();
  } catch {
    // 既に停止済み
  }
  current.source.disconnect();
  current = null;
}
