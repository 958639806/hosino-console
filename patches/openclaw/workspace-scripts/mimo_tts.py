#!/usr/bin/env python3
"""小米 MiMo 语音合成：python3 mimo_tts.py "文本" [--voice 冰糖] [--model mimo-v2.5-tts] [--out 文件] [--style "风格指令"] [--sing] [--stream]

走 OpenAI 兼容 Chat Completions；合成文本放 assistant，风格指令放 user。
音频返回在 choices[0].message.audio.data（Base64）。
唱歌：文本开头加 (唱歌) 标签，或传 --sing。
"""
import argparse
import os
import base64
import json
import sqlite3
import sys
import urllib.error
import urllib.request
import media_deadline as _media

API_URL = "https://token-plan-cn.xiaomimimo.com/v1/chat/completions"
DB = os.environ.get("OPENCLAW_SQLITE", os.path.join(os.environ.get("OPENCLAW_HOME", "__HS_OPENCLAW_HOME__"), "state", "openclaw.sqlite"))


def load_key() -> str:
    db = sqlite3.connect(f"file:{DB}?mode=ro", uri=True)
    try:
        for (v,) in db.execute(
            "select value from secret_store_entries where name='XIAOMI_MIMO_API_KEY' and deleted_at_ms is null"
        ):
            return v
        raise RuntimeError("XIAOMI_MIMO_API_KEY not found in secret store")
    finally:
        db.close()


def synth(text: str, voice: str, model: str, style: str, sing: bool, _budget=None) -> bytes:
    _budget = _media.Deadline(240.0) if _budget is None else _budget
    if sing and not text.startswith("("):
        text = "(唱歌)" + text
    messages = []
    if style:
        messages.append({"role": "user", "content": style})
    messages.append({"role": "assistant", "content": text})
    body = {"model": model, "messages": messages, "audio": {"format": "wav"}}
    if model in ("mimo-v2.5-tts",) and voice:
        body["audio"]["voice"] = voice
    req = urllib.request.Request(
        API_URL,
        json.dumps(body).encode(),
        {"Authorization": f"Bearer {load_key()}", "Content-Type": "application/json"},
    )
    try:
        data = _budget.read_json(req, 180.0)
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"HTTP {e.code}: {e.read(500).decode(errors='replace')}") from e
    if data.get("error"):
        raise RuntimeError(json.dumps(data["error"], ensure_ascii=False))
    audio = data.get("choices", [{}])[0].get("message", {}).get("audio", {})
    b64 = audio.get("data") if isinstance(audio, dict) else None
    if not b64:
        raise RuntimeError(f"no audio in response: {json.dumps(data, ensure_ascii=False)[:400]}")
    _budget.remaining()
    return base64.b64decode(b64, validate=True)


if __name__ == "__main__":
    _budget = _media.Deadline(240.0)
    ap = argparse.ArgumentParser()
    ap.add_argument("text")
    ap.add_argument("--voice", default="冰糖")
    ap.add_argument("--model", default="mimo-v2.5-tts")
    ap.add_argument("--out", default="/tmp/mimo_out.wav")
    ap.add_argument("--style", default="")
    ap.add_argument("--sing", action="store_true")
    args = ap.parse_args()
    try:
        audio = synth(args.text, args.voice, args.model, args.style, args.sing, _budget)
        _media.atomic_bytes(args.out, audio, _budget)
        print(json.dumps({"status": "ok", "out": args.out, "bytes": len(audio), "model": args.model, "voice": args.voice}, ensure_ascii=False))
    except Exception as e:
        print(json.dumps({"status": "error", "error": str(e)}, ensure_ascii=False))
        sys.exit(1)
