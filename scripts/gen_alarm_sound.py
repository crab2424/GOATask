"""通知音 frontend/public/sounds/alarm.wav を生成する（外部音源を使わずライセンス問題を避けるため合成）。

「ピン・ポーン」を2回鳴らす約2.4秒のチャイム。実行: python3 scripts/gen_alarm_sound.py
"""
import math
import struct
import wave
from pathlib import Path

RATE = 22050
OUT = Path(__file__).resolve().parent.parent / "frontend/public/sounds/alarm.wav"


def bell(freq: float, dur: float) -> list[float]:
    n = int(RATE * dur)
    out = []
    for i in range(n):
        t = i / RATE
        env = math.exp(-t * 3.2) * min(1.0, t / 0.005)  # 立ち上がり5msでクリック音を防ぐ
        s = (math.sin(2 * math.pi * freq * t)
             + 0.35 * math.sin(2 * math.pi * freq * 2 * t)
             + 0.12 * math.sin(2 * math.pi * freq * 3.01 * t))
        out.append(env * s / 1.47)
    return out


def mix(buf: list[float], part: list[float], at: float) -> None:
    start = int(RATE * at)
    for i, v in enumerate(part):
        if start + i < len(buf):
            buf[start + i] += v


buf = [0.0] * int(RATE * 2.4)
for offset in (0.0, 1.2):
    mix(buf, bell(1318.5, 0.9), offset)        # E6
    mix(buf, bell(1046.5, 0.9), offset + 0.3)  # C6
peak = max(abs(v) for v in buf)
OUT.parent.mkdir(parents=True, exist_ok=True)
with wave.open(str(OUT), "wb") as w:
    w.setnchannels(1)
    w.setsampwidth(2)
    w.setframerate(RATE)
    w.writeframes(b"".join(struct.pack("<h", int(v / peak * 0.8 * 32767)) for v in buf))
print(f"wrote {OUT}")
