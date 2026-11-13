#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# MEDIA-LATENCY-FIX v1
"""星野语音：现有 Gateway 的 xAI / Ara，240 秒总预算。

保留 --out/--format/--style/--voice/--model/--repeat 和 JSON 契约。
style/model 仅为旧调用兼容，不发送给 xAI；voice 只接受原生已知音色。
每次 synth 只发送一次 tts.convert；未收到终态时返回 uncertain，不重试。
认证由当前 Gateway 原生处理，不读取或导出提供商凭据。
"""

import argparse
import base64
import json
import os
import sys

# QQ-MEDIA-TTS-CONTRACT-PATCH v1
import io
import math
import re
import shutil
import subprocess
import tempfile
import wave

DEFAULT_STYLE = (
    "萝莉音，音调偏高，稚嫩软糯，像年纪很小的女孩，"
    "音色明亮甜美，语气自然，傲娇，带一点小得意。"
)
DEFAULT_VOICE = "Ara"
DEFAULT_MODEL = "xai"
SUPPORTED_VOICES = frozenset({"ara", "eve", "leo", "rex", "sal", "luna", "carina"})


# QQ-MEDIA-TOTAL-DEADLINE v1: one monotonic 240s budget; no second synthesis.
import time
import media_deadline as _media

TTS_TOTAL_SECONDS = 240.0
TTS_MAX_RESPONSE_BYTES = 64 * 1024 * 1024
TTS_MAX_ARTIFACT_BYTES = 32 * 1024 * 1024


class GatewayOutcomeUnknown(Exception):
    """The request may have run; an absent terminal response is not a failure ACK."""


# Fixed code, never interpolated with speech or credentials. Only JSON goes to
# stdin. This stays inside this already hash-admitted Python dependency.
_GATEWAY_JS = r'''
const fs=require('node:fs'),tls=require('node:tls');
const {X509Certificate}=require('node:crypto');
const {createRequire}=require('node:module');
const BASE='__HS_OPENCLAW_HOME__',DIST='__HS_OPENCLAW_PKG__/dist';
const write=process.stdout.write.bind(process.stdout);
for(const s of ['stdout','stderr'])process[s].write=(chunk,...args)=>{args.find(x=>typeof x==='function')?.();return true;};
const need=(v,c)=>{if(!v)throw Object.assign(new Error(c),{safeCode:c});};
function read(file,cap){
 const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW|fs.constants.O_NOATIME);
 try{const a=fs.fstatSync(fd);need(a.isFile()&&a.nlink===1&&a.uid===process.getuid()&&(a.mode&0o022)===0&&a.size>0&&a.size<=cap,'GATEWAY_FILE_CONTRACT');
 const raw=fs.readFileSync(fd),b=fs.fstatSync(fd);
 need(raw.length===a.size&&['dev','ino','size','mtimeMs','ctimeMs','uid','mode'].every(k=>a[k]===b[k]),'GATEWAY_FILE_CONTRACT');return raw;
 }finally{fs.closeSync(fd);}
}
function trustedFile(file){need(fs.realpathSync(file)===file,'GATEWAY_FILE_CONTRACT');}
function tlsOptions(cfg){
 need(cfg.gateway?.tls?.enabled===true,'GATEWAY_TLS_REQUIRED');
 const file=BASE+'/tls/gateway.crt';trustedFile(file);const pem=read(file,65536),c=new X509Certificate(pem);
 const pin=c.fingerprint256.toLowerCase().replaceAll(':','');
 need(Date.now()>=Date.parse(c.validFrom)&&Date.now()<Date.parse(c.validTo)&&c.checkIP('__HS_GATEWAY_CERT_IP__'),'GATEWAY_CERT_IDENTITY');
 return{ca:pem,rejectUnauthorized:true,minVersion:'TLSv1.3',checkServerIdentity:(_h,peer)=>String(peer.fingerprint256).toLowerCase().replaceAll(':','')!==pin?new Error('GATEWAY_CERT_IDENTITY'):tls.checkServerIdentity('__HS_GATEWAY_CERT_IP__',peer)};
}
async function run(){
 need(process.getuid()===1001&&process.getgid()===1001,'GATEWAY_UID_REQUIRED');
 const input=fs.readFileSync(0);need(input.length<=131072,'GATEWAY_INPUT_INVALID');const p=JSON.parse(input);
 need(typeof p.text==='string'&&p.text.length>0&&p.text.length<=16000&&['ara','eve','leo','rex','sal','luna','carina'].includes(p.voice)&&Number.isFinite(p.timeoutMs)&&p.timeoutMs>0&&p.timeoutMs<=150000,'GATEWAY_INPUT_INVALID');
 const file=BASE+'/openclaw.json';trustedFile(file);const cfg=JSON.parse(read(file,2097152));
 need(['/console','/console/'].includes(cfg.gateway?.controlUi?.basePath),'GATEWAY_CONSOLE_REQUIRED');
 const auth=typeof cfg.gateway?.auth?.token==='string'&&cfg.gateway.auth.token?{token:cfg.gateway.auth.token}:typeof cfg.gateway?.auth?.password==='string'&&cfg.gateway.auth.password?{password:cfg.gateway.auth.password}:null;need(auth,'GATEWAY_AUTH_REQUIRED');
 const req=createRequire('__HS_OPENCLAW_PKG__/package.json'),{WebSocket}=req('ws');
 const info=await import(DIST+'/client-info-S_xwnr2o.mjs'),channel=await import(DIST+'/message-channel-DDiCYM9I.mjs');
 const client={id:info.n?.CLI,mode:info.r?.CLI??info.r?.BACKEND,version:'xingye-ara-20261029-1',platform:'linux'};
 need(typeof channel.i==='function'&&channel.i(client),'GATEWAY_CLIENT_PROFILE');
 const options=tlsOptions(cfg);
 return await new Promise(resolve=>{
  let ws,done=false,connected=false,connectSent=false,healthSent=false,dispatches=0,terminal=false;
  const finish=(safeCode,data={})=>{if(done)return;done=true;clearTimeout(timer);try{ws?.terminate();}catch{}resolve({status:dispatches&&!terminal?'uncertain':data.audioBase64?'ok':'error',safeCode,dispatches,...data});};
  const timer=setTimeout(()=>finish('GATEWAY_DEADLINE'),p.timeoutMs);
  const send=(id,method,params)=>ws.send(JSON.stringify({type:'req',id,method,params}));
  try{ws=new WebSocket('wss://127.0.0.1:18789/console',{...options,maxPayload:4*1024**2,handshakeTimeout:Math.min(8000,p.timeoutMs)});
  ws.on('unexpected-response',(_q,r)=>{r.resume?.();finish('GATEWAY_UPGRADE_FAILED');});
  ws.on('error',()=>finish('GATEWAY_SOCKET_FAILED'));ws.on('close',()=>finish('GATEWAY_SOCKET_CLOSED'));
  ws.on('message',raw=>{if(done)return;try{
   const f=JSON.parse(String(raw));
   if(f.type==='event'&&f.event==='connect.challenge'){if(connectSent)return;connectSent=true;send('connect','connect',{minProtocol:4,maxProtocol:4,client,role:'operator',scopes:['operator.admin'],caps:[],auth});return;}
   if(f.type!=='res')return;
   if(f.id==='connect'){
    need(!connected&&f.ok===true&&f.payload?.type==='hello-ok'&&f.payload.protocol===4,'GATEWAY_CONNECT_FAILED');connected=true;
    need(Array.isArray(f.payload.features?.methods)&&['health','tts.convert'].every(x=>f.payload.features.methods.includes(x)),'GATEWAY_METHODS_REQUIRED');
    healthSent=true;send('health','health',{});return;
   }
   if(f.id==='health'){
    need(connected&&healthSent&&dispatches===0&&f.ok===true,'GATEWAY_HEALTH_FAILED');
    // Mark before send: a send/close race must never become a confirmed failure.
    dispatches=1;send('tts','tts.convert',{text:p.text,provider:'xai',voiceId:p.voice});return;
   }
   if(f.id==='tts'){
    need(dispatches===1&&!terminal&&typeof f.ok==='boolean','GATEWAY_PROTOCOL_FAILED');terminal=true;
    if(f.ok!==true){finish('GATEWAY_TTS_FAILED');return;}
    const q=f.payload;need(q?.provider==='xai'&&q.outputFormat==='mp3'&&typeof q.audioPath==='string','GATEWAY_AUDIO_INVALID');
    const audio=q.audioPath;need(audio.endsWith('.mp3')&&(audio.startsWith('/tmp/openclaw/')||audio.startsWith(BASE+'/media/')),'GATEWAY_AUDIO_BOUNDARY');trustedFile(audio);
    const bytes=read(audio,32*1024**2);need(bytes.length>=4&&(bytes.subarray(0,3).toString()==='ID3'||bytes[0]===255&&(bytes[1]&224)===224),'GATEWAY_AUDIO_INVALID');
    finish('GATEWAY_TTS_COMPLETE',{audioBase64:bytes.toString('base64'),provider:'xai',voice:p.voice});
   }
  }catch(error){finish(typeof error?.safeCode==='string'?error.safeCode:'GATEWAY_PROTOCOL_FAILED');}});
  }catch{finish('GATEWAY_SOCKET_FAILED');}
 });
}
run().then(r=>write(JSON.stringify(r)+'\n'),()=>write(JSON.stringify({status:'error',safeCode:'GATEWAY_SETUP_FAILED',dispatches:0})+'\n'));
'''


# QQ-VOICE-NATURAL-TIMING v1: diagnostics only; no text, paths or credentials.
import contextlib
import contextvars
import functools

_VOICE_TIMING = contextvars.ContextVar("xingye_voice_timing", default=None)
_VOICE_STAGES = frozenset({"fish_request", "fish_headers", "fish_body", "fish_concat",
                           "mimo_request", "mimo_encode", "xai_gateway", "publication",
                           "audio_probe", "wav_conversion", "atomic_publish"})


@contextlib.contextmanager
def _voice_stage(stage):
    trace = _VOICE_TIMING.get()
    if trace is None:
        yield
        return
    started = time.monotonic()
    try:
        yield
    finally:
        if trace is not None and stage in _VOICE_STAGES:
            try:
                elapsed = round(max(0.0, (time.monotonic() - started) * 1000), 3)
                item = trace["stages"].setdefault(stage, {"ms": 0.0, "count": 0})
                item["ms"] = round(item["ms"] + elapsed, 3)
                item["count"] += 1
            except Exception:
                pass  # Diagnostics cannot turn a successful synthesis into failure.


def _voice_timed(stage):
    def decorate(fn):
        @functools.wraps(fn)
        def run(*args, **kwargs):
            with _voice_stage(stage):
                return fn(*args, **kwargs)
        return run
    return decorate


def _voice_timing_scope(fn):
    @functools.wraps(fn)
    def run(*args, **kwargs):
        # Direct bash/stdout-stderr are model-visible. Emit diagnostics only for
        # the existing controlled runner; never serialize the capability value.
        if not os.environ.get("OPENCLAW_CONTROLLED_JOB_NONCE"):
            return fn(*args, **kwargs)
        trace = {"stages": {}, "requestedProvider": "unknown", "synthesizedProvider": "unknown", "fallback": False}
        token = _VOICE_TIMING.set(trace)
        started, result, state = time.monotonic(), None, "error"
        try:
            result = fn(*args, **kwargs)
            state = "ok"
            return result
        except GatewayOutcomeUnknown:
            state = "uncertain"
            raise
        finally:
            _VOICE_TIMING.reset(token)
            try:
                provider = result.get("provider") if isinstance(result, dict) else trace["synthesizedProvider"]
                record = {"schema": "xingye-voice-timing-v1", "state": state,
                          "elapsedMs": round(max(0.0, (time.monotonic() - started) * 1000), 3),
                          "requestedProvider": trace["requestedProvider"],
                          "completedProvider": provider if provider in {"fish", "xai", "mimo"} else "unknown",
                          "fallback": trace["fallback"],
                          "phases": [{"stage": name, **value} for name, value in sorted(trace["stages"].items())]}
                sys.stderr.write("XINGYE_VOICE_TIMING_V1 " + json.dumps(record, separators=(",", ":")) + "\n")
            except Exception:
                pass
    return run


def _tts_remaining(deadline, cap=None):
    remaining = deadline - time.monotonic()
    if remaining <= 0:
        raise TimeoutError("tts_total_deadline_exceeded: no output was delivered")
    return min(remaining, cap) if cap is not None else remaining


def _prepare_output(out: str, output_format=None, _deadline=None):
    _deadline = time.monotonic() + TTS_TOTAL_SECONDS if _deadline is None else _deadline
    _tts_remaining(_deadline)
    if not isinstance(out, str) or not out.strip():
        raise ValueError("output_path_invalid: --out must be a nonempty path")
    actual_out = os.path.abspath(os.path.expanduser(out))
    parent = os.path.dirname(actual_out)
    if not os.path.isdir(parent):
        raise ValueError("output_parent_missing: --out parent must already exist; synthesis was not requested")
    if not os.access(parent, os.W_OK):
        raise ValueError("output_parent_not_writable: --out parent is not writable; synthesis was not requested")
    if os.path.isdir(actual_out):
        raise ValueError("output_path_invalid: --out points to a directory; synthesis was not requested")
    suffix = os.path.splitext(actual_out)[1].lower()
    if suffix and suffix not in {".wav", ".mp3"}:
        raise ValueError("audio_format_unsupported: --out extension must be wav or mp3; synthesis was not requested")
    audio_format = output_format or (suffix[1:] if suffix in {".wav", ".mp3"} else "wav")
    if audio_format not in {"wav", "mp3"}:
        raise ValueError("audio_format_unsupported: only wav and mp3 are supported; synthesis was not requested")
    if output_format is not None and suffix in {".wav", ".mp3"} and suffix[1:] != audio_format:
        raise ValueError("audio_format_path_conflict: --format and --out extension disagree; synthesis was not requested")
    ffmpeg = None
    if audio_format == "wav":
        ffmpeg = shutil.which("ffmpeg")
        if not ffmpeg:
            raise ValueError("wav_converter_missing")
    if not shutil.which("ffprobe"):
        raise ValueError("audio_validator_missing")
    return actual_out, audio_format, ffmpeg


def _validate_wav(raw: bytes):
    if not raw or len(raw) < 12 or raw[:4] != b"RIFF" or raw[8:12] != b"WAVE":
        raise ValueError("audio_format_invalid: expected WAV bytes; no output was delivered")
    try:
        with wave.open(io.BytesIO(raw), "rb") as audio:
            frames = audio.getnframes()
            expected_bytes = frames * audio.getnchannels() * audio.getsampwidth()
            if frames <= 0 or len(audio.readframes(frames)) != expected_bytes:
                raise ValueError("empty WAV")
    except (wave.Error, EOFError, ValueError):
        raise ValueError("audio_format_invalid: WAV data is empty or malformed; no output was delivered") from None


def _is_mp3(raw: bytes):
    # Format signature check; phonetic quality/playback still requires client validation.
    return raw.startswith(b"ID3") or (
        len(raw) >= 4 and raw[0] == 0xFF and raw[1] & 0xE0 == 0xE0
        and raw[1] & 0x06 != 0 and raw[2] & 0xF0 not in {0, 0xF0}
        and raw[2] & 0x0C != 0x0C
    )


@_voice_timed("publication")
def _publish_native_mp3(raw: bytes, out: str, audio_format: str, ffmpeg=None, _deadline=None):
    _deadline = time.monotonic() + TTS_TOTAL_SECONDS if _deadline is None else _deadline
    _tts_remaining(_deadline)
    parent = os.path.dirname(out)
    temporary_paths = []
    try:
        if not raw or len(raw) > TTS_MAX_ARTIFACT_BYTES or not _is_mp3(raw):
            raise ValueError("audio_format_invalid")
        descriptor, mp3_path = tempfile.mkstemp(prefix=".xingye-", suffix=".mp3", dir=parent)
        temporary_paths.append(mp3_path)
        with os.fdopen(descriptor, "wb") as audio:
            audio.write(raw)
            audio.flush()
            os.fsync(audio.fileno())
        try:
            with _voice_stage("audio_probe"):
                checked = _media.Deadline(TTS_TOTAL_SECONDS, absolute=_deadline).run(
                    [shutil.which("ffprobe") or "ffprobe", "-v", "error", "-select_streams", "a:0",
                     "-show_entries", "stream=codec_name:format=duration", "-of", "json", mp3_path],
                    check=True, capture_output=True, text=True, cap=_tts_remaining(_deadline, 10.0),
                )
            metadata = json.loads(checked.stdout)
            duration = float(metadata["format"]["duration"])
            if metadata["streams"][0]["codec_name"] != "mp3" or not math.isfinite(duration) or duration <= 0:
                raise ValueError("invalid codec or duration")
        except (OSError, subprocess.SubprocessError, ValueError, KeyError, IndexError, TypeError):
            raise ValueError("audio_format_invalid") from None
        # No duration truncation: long speech keeps its full audio. The existing
        # absolute budget and 32 MiB controlled-artifact bound remain authority.
        finished_path, mime_type = mp3_path, "audio/mpeg"
        if audio_format == "wav":
            descriptor, wav_path = tempfile.mkstemp(prefix=".xingye-", suffix=".wav", dir=parent)
            os.close(descriptor)
            temporary_paths.append(wav_path)
            try:
                with _voice_stage("wav_conversion"):
                    _media.Deadline(TTS_TOTAL_SECONDS, absolute=_deadline).run(
                        [ffmpeg, "-nostdin", "-hide_banner", "-loglevel", "error", "-y",
                         "-i", mp3_path, "-codec:a", "pcm_s16le", "-f", "wav", wav_path],
                        check=True, capture_output=True, cap=_tts_remaining(_deadline, 60.0),
                    )
            except (OSError, subprocess.SubprocessError):
                raise ValueError("wav_conversion_failed") from None
            with open(wav_path, "rb") as converted:
                wav = converted.read(TTS_MAX_ARTIFACT_BYTES + 1)
            if len(wav) > TTS_MAX_ARTIFACT_BYTES:
                raise ValueError("audio_artifact_too_large")
            _validate_wav(wav)
            finished_path, mime_type = wav_path, "audio/wav"
        _tts_remaining(_deadline)
        with _voice_stage("atomic_publish"):
            os.replace(finished_path, out)
        return {"out": out, "media": out, "audioFormat": audio_format,
                "mimeType": mime_type, "filename": os.path.basename(out),
                "bytes": os.path.getsize(out)}
    finally:
        for temporary_path in temporary_paths:
            if os.path.exists(temporary_path):
                os.unlink(temporary_path)


_SAFE_ERRORS = frozenset({
    "gateway_tts_outcome_unknown", "gateway_tts_unavailable", "gateway_tts_failed",
    "gateway_tts_protocol_failed", "gateway_tts_audio_invalid", "voice_unsupported",
    "voice_input_invalid", "audio_format_invalid", "audio_artifact_too_large",
    "wav_conversion_failed", "wav_converter_missing", "audio_validator_missing",
    "fish_tts_failed", "mimo_tts_failed", "mimo_key_missing", "mimo_mp3_encode_failed",
})


def _safe_error(exc):
    if isinstance(exc, GatewayOutcomeUnknown):
        return "gateway_tts_outcome_unknown"
    text = str(exc).split(":", 1)[0]
    if text in _SAFE_ERRORS or text in {"tts_total_deadline_exceeded", "tts_http_deadline_exceeded"}:
        return text
    return "voice_generation_failed"


@_voice_timed("xai_gateway")
def _gateway_audio(text, voice, deadline):
    node = shutil.which("node")
    if not node:
        raise ValueError("gateway_tts_unavailable")
    # Do not inherit job capability nonces, provider keys, NODE_OPTIONS or other
    # injection hooks. Provider authentication stays in the running Gateway.
    env = {"PATH": os.environ.get("PATH", "/usr/bin:/bin"),
           "HOME": os.environ.get("HOME", "__HS_USER_HOME__"), "LANG": "C.UTF-8"}
    timeout_ms = max(1, int(_tts_remaining(deadline, 150.0) * 1000) - 250)
    payload = json.dumps({"text": text, "voice": voice, "timeoutMs": timeout_ms}, ensure_ascii=False).encode()
    with tempfile.TemporaryFile(mode="w+b") as input_file:
        input_file.write(payload)
        input_file.seek(0)
        try:
            result = _media.Deadline(TTS_TOTAL_SECONDS, absolute=deadline).run(
                [node, "-e", _GATEWAY_JS], stdin=input_file, env=env,
                capture_output=True, check=False, cap=_tts_remaining(deadline, 151.0),
            )
        except OSError:
            raise ValueError("gateway_tts_unavailable") from None
        except (TimeoutError, subprocess.SubprocessError):
            # A killed client cannot prove whether the Gateway saw its request.
            raise GatewayOutcomeUnknown("gateway_tts_outcome_unknown") from None
    if result.returncode != 0 or not result.stdout or len(result.stdout) > TTS_MAX_RESPONSE_BYTES:
        raise GatewayOutcomeUnknown("gateway_tts_outcome_unknown")
    try:
        data = json.loads(result.stdout)
    except (ValueError, TypeError):
        raise GatewayOutcomeUnknown("gateway_tts_outcome_unknown") from None
    if not isinstance(data, dict) or data.get("status") == "uncertain":
        raise GatewayOutcomeUnknown("gateway_tts_outcome_unknown")
    if data.get("status") == "error" and data.get("dispatches") in {0, 1}:
        raise ValueError("gateway_tts_failed")
    if data.get("status") != "ok" or data.get("dispatches") != 1 or data.get("provider") != "xai" or data.get("voice") != voice:
        raise GatewayOutcomeUnknown("gateway_tts_outcome_unknown")
    try:
        raw = base64.b64decode(data["audioBase64"], validate=True)
    except (ValueError, KeyError, TypeError):
        raise ValueError("gateway_tts_audio_invalid") from None
    if len(raw) > TTS_MAX_ARTIFACT_BYTES or not _is_mp3(raw):
        raise ValueError("gateway_tts_audio_invalid")
    return raw


# ---------------- HOSINO-FISH-TTS v1 (2026-11-01) ----------------
# Settings: workspace/fun/voice-tts.json, written by the console 拟人化 menu.
# The Fish key comes ONLY from the FISH_API_KEY environment variable.
TTS_CONFIG_PATH = "__HS_OPENCLAW_HOME__/workspace/fun/voice-tts.json"
FISH_URL = "https://api.fish.audio/v1/tts"
MIMO_URL = "https://token-plan-cn.xiaomimimo.com/v1/chat/completions"
FISH_TAGS = ("playful", "tsundere", "annoyed", "gentle", "calm", "shy", "proud",
             "whispering", "sleepy", "sad", "excited")
FISH_DEFAULT_EMOTION_MAP = {
    "委屈": "sad", "难过": "sad", "伤心": "sad", "哭": "sad",
    "傲娇": "tsundere", "哼": "tsundere", "嘴硬": "tsundere",
    "生气": "annoyed", "不满": "annoyed", "烦": "annoyed", "炸毛": "annoyed",
    "温柔": "gentle", "安慰": "gentle", "撒娇": "playful", "调皮": "playful", "坏笑": "playful",
    "平静": "calm", "认真": "calm", "害羞": "shy", "脸红": "shy",
    "得意": "proud", "骄傲": "proud", "小声": "whispering", "悄悄": "whispering",
    "困": "sleepy", "犯困": "sleepy", "打哈欠": "sleepy",
    "开心": "excited", "兴奋": "excited", "惊喜": "excited",
}
TTS_CONFIG_DEFAULTS = {
    "provider": "xai",  # xai | fish | mimo
    "fish": {"model": "s2.1-pro-free", "referenceId": "e0dea986fcf54303a0eda1d57db88e27",
             "temperature": 0.5, "topP": 0.6, "timeoutSec": 30, "perSentence": True,
             "stripLeadingUm": True, "emotionTags": True, "defaultTag": "",
             "emotionMap": FISH_DEFAULT_EMOTION_MAP, "fallback": "xai"},  # xai | mimo | none (__HS_OWNER_NAME__ 2026-11-01: Fish 失败回落 Grok)
    "mimo": {"model": "mimo-v2.5-tts", "voice": "冰糖", "style": DEFAULT_STYLE},
}


def _load_tts_config(path=None):
    import copy
    cfg = copy.deepcopy(TTS_CONFIG_DEFAULTS)
    try:
        with open(path or TTS_CONFIG_PATH, "r", encoding="utf-8") as fh:
            raw = json.load(fh)
    except (OSError, ValueError):
        return cfg
    if not isinstance(raw, dict):
        return cfg
    if raw.get("provider") in {"xai", "fish", "mimo"}:
        cfg["provider"] = raw["provider"]
    f, r = cfg["fish"], raw.get("fish") if isinstance(raw.get("fish"), dict) else {}
    if isinstance(r.get("model"), str) and re.fullmatch(r"[A-Za-z0-9._-]{1,40}", r["model"]):
        f["model"] = r["model"]
    if isinstance(r.get("referenceId"), str) and re.fullmatch(r"[0-9a-f]{32}", r["referenceId"]):
        f["referenceId"] = r["referenceId"]
    for k, lo, hi in (("temperature", 0.0, 1.0), ("topP", 0.0, 1.0), ("timeoutSec", 3, 120)):
        v = r.get(k)
        if isinstance(v, (int, float)) and not isinstance(v, bool) and lo <= v <= hi:
            f[k] = v
    for k in ("perSentence", "stripLeadingUm", "emotionTags"):
        if isinstance(r.get(k), bool):
            f[k] = r[k]
    if r.get("defaultTag") == "" or r.get("defaultTag") in FISH_TAGS:
        f["defaultTag"] = r["defaultTag"]
    if r.get("fallback") in {"mimo", "xai", "none"}:
        f["fallback"] = r["fallback"]
    em = r.get("emotionMap")
    if isinstance(em, dict):
        f["emotionMap"] = {k: v for k, v in em.items()
                           if isinstance(k, str) and 0 < len(k) <= 8 and v in FISH_TAGS}
    m, rm = cfg["mimo"], raw.get("mimo") if isinstance(raw.get("mimo"), dict) else {}
    for k in ("model", "voice", "style"):
        if isinstance(rm.get(k), str) and 0 < len(rm[k]) <= 300:
            m[k] = rm[k]
    return cfg


_MARK_RE = re.compile(r"[【\[（(]([^】\]）)]{1,8})[】\]）)]")
_UM_RE = re.compile(r"^\s*(?:嗯|唔|呃)+\s*(?:……|…+|\.{2,}|，|,|、)*\s*")
_SENT_RE = re.compile(r"[^。！？!?…~～\n]+(?:[。！？!?…~～]+|$)")


def fish_prepare(text, fcfg):
    """Text -> list of Fish inputs: one sentence each, at most ONE leading [tag]."""
    emap = fcfg.get("emotionMap") or {}
    current = fcfg.get("defaultTag") or ""
    if fcfg.get("stripLeadingUm", True):
        text = _UM_RE.sub("", text, count=1)
    # Walk markers in order; a marker sets the tag for the sentences after it.
    pieces, pos = [], 0
    for m in _MARK_RE.finditer(text):
        pieces.append((current, text[pos:m.start()]))
        word = m.group(1).strip().lower()
        hit = word if word in FISH_TAGS else emap.get(m.group(1).strip())
        if hit is None:
            hit = next((v for k, v in emap.items() if k in m.group(1)), None)
        if hit:
            current = hit
        pos = m.end()
    pieces.append((current, text[pos:]))
    out = []
    for tag, chunk in pieces:
        sents = _SENT_RE.findall(chunk) if fcfg.get("perSentence", True) else [chunk]
        for s in sents:
            s = s.strip()
            if not s or not re.search(r"[\w\u4e00-\u9fff]", s):
                continue
            out.append(("[%s] %s" % (tag, s)) if tag and fcfg.get("emotionTags", True) else s)
    if not fcfg.get("perSentence", True) and out:
        # single-request mode: keep only the first tag
        first = out[0]
        rest = [re.sub(r"^\[[a-z]+\] ", "", x) for x in out[1:]]
        out = [" ".join([first] + rest)]
    return out


def strip_emotion_markers(text, fcfg):
    """Remove 【marker】 only when it is a known emotion-map key or Fish tag."""
    emap = fcfg.get("emotionMap") or {}
    def rep(m):
        w = m.group(1).strip()
        return "" if (w in emap or w.lower() in FISH_TAGS) else m.group(0)
    return _MARK_RE.sub(rep, text).strip()


VOICES_PATH = "__HS_OPENCLAW_HOME__/workspace/voices/voices.json"  # HOSINO-VOICE-ALIAS v1


def resolve_voice_alias(alias, path=None):
    """alias | Chinese title/nickname | 32-hex id -> (reference_id or None, warning or None)."""
    try:
        with open(path or VOICES_PATH, "r", encoding="utf-8") as fh:
            d = json.load(fh)
        voices = [v for v in d.get("voices", []) if isinstance(v, dict) and re.fullmatch(r"[0-9a-f]{32}", str(v.get("id", "")))]
    except (OSError, ValueError, AttributeError):
        voices, d = [], {}
    dflt = next((v for v in voices if v.get("alias") == d.get("default")), None) or next((v for v in voices if v.get("default")), None)
    dflt_id = dflt["id"] if dflt else None
    if alias is None or not str(alias).strip():
        return dflt_id, None
    a = str(alias).strip()
    for v in voices:
        names = [v.get("alias"), v.get("id"), v.get("title")] + list(v.get("nicknames") or [])
        if any(isinstance(n, str) and n.strip().lower() == a.lower() for n in names):
            return v["id"], None
    for v in voices:  # title without the bracket part, e.g. 星野（中配） -> 星野
        t = re.sub(r"[（(].*?[）)]", "", str(v.get("title", ""))).strip()
        if t and t == a:
            return v["id"], None
    return dflt_id, "voice_alias_not_found_using_default"


class FishFailed(Exception):
    pass


@_voice_timed("fish_request")
def _fish_one(text, fcfg, key, deadline):
    import urllib.request
    import urllib.error
    body = {"text": text, "reference_id": fcfg["referenceId"], "format": "mp3",
            "temperature": fcfg["temperature"], "top_p": fcfg["topP"]}
    req = urllib.request.Request(FISH_URL, data=json.dumps(body, ensure_ascii=False).encode(),
                                 headers={"Authorization": "Bearer " + key,
                                          "Content-Type": "application/json", "model": fcfg["model"]})
    cap = _tts_remaining(deadline, float(fcfg["timeoutSec"]))
    try:
        # Keep urllib's existing opener, environment proxy and TLS behaviour.
        # Headers includes DNS/TCP/TLS and server wait; it is not pure inference.
        with _voice_stage("fish_headers"):
            response = urllib.request.urlopen(req, timeout=cap)
        with response as resp:
            with _voice_stage("fish_body"):
                raw = resp.read(TTS_MAX_ARTIFACT_BYTES + 1)
    except urllib.error.HTTPError as e:
        raise FishFailed("fish_http_%d" % e.code) from None
    except Exception:  # timeout / network
        raise FishFailed("fish_network_or_timeout") from None
    if len(raw) > TTS_MAX_ARTIFACT_BYTES or not _is_mp3(raw):
        raise FishFailed("fish_audio_invalid")
    return raw


@_voice_timed("fish_concat")
def _concat_mp3(parts, deadline):
    if len(parts) == 1:
        return parts[0]
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        raise FishFailed("fish_concat_unavailable")
    with tempfile.TemporaryDirectory(prefix=".xingye-fish-") as d:
        lst = os.path.join(d, "list.txt")
        with open(lst, "w") as fh:
            for i, p in enumerate(parts):
                fp = os.path.join(d, "%03d.mp3" % i)
                with open(fp, "wb") as a:
                    a.write(p)
                fh.write("file '%s'\n" % fp)
        outp = os.path.join(d, "all.mp3")
        try:
            _media.Deadline(TTS_TOTAL_SECONDS, absolute=deadline).run(
                [ffmpeg, "-nostdin", "-hide_banner", "-loglevel", "error", "-y", "-f", "concat",
                 "-safe", "0", "-i", lst, "-c:a", "libmp3lame", "-q:a", "3", outp],
                check=True, capture_output=True, cap=_tts_remaining(deadline, 60.0))
        except (OSError, subprocess.SubprocessError):
            raise FishFailed("fish_concat_failed") from None
        with open(outp, "rb") as fh:
            return fh.read(TTS_MAX_ARTIFACT_BYTES + 1)


def _fish_mp3(text, fcfg, deadline):
    key = (os.environ.get("FISH_API_KEY") or "").strip()
    if not key:
        raise FishFailed("fish_key_missing")
    sentences = fish_prepare(text, fcfg)
    if not sentences:
        raise FishFailed("fish_text_empty")
    parts = [_fish_one(s, fcfg, key, deadline) for s in sentences]
    return _concat_mp3(parts, deadline)


@_voice_timed("mimo_request")
def _mimo_mp3(text, cfg, deadline):
    """Inline MiMo (same request as scripts/mimo_tts.py) -> mp3 bytes."""
    import sqlite3
    import urllib.request
    m = cfg["mimo"]
    db_path = os.path.join(os.environ.get("OPENCLAW_HOME", "__HS_OPENCLAW_HOME__"), "state", "openclaw.sqlite")
    db = sqlite3.connect("file:%s?mode=ro" % db_path, uri=True)
    try:
        row = db.execute("select value from secret_store_entries where name='XIAOMI_MIMO_API_KEY' "
                         "and deleted_at_ms is null").fetchone()
    finally:
        db.close()
    if not row:
        raise ValueError("mimo_key_missing")
    body = {"model": m["model"], "messages": [{"role": "user", "content": m["style"]},
                                              {"role": "assistant", "content": text}],
            "audio": {"format": "wav", "voice": m["voice"]}}
    req = urllib.request.Request(MIMO_URL, json.dumps(body, ensure_ascii=False).encode(),
                                 {"Authorization": "Bearer " + row[0], "Content-Type": "application/json"})
    try:
        data = _media.Deadline(TTS_TOTAL_SECONDS, absolute=deadline).read_json(req, _tts_remaining(deadline, 120.0))
        wav = base64.b64decode(data["choices"][0]["message"]["audio"]["data"], validate=True)
    except Exception:
        raise ValueError("mimo_tts_failed") from None
    _validate_wav(wav)
    return _wav_to_mp3(wav, deadline)


@_voice_timed("mimo_encode")
def _wav_to_mp3(wav, deadline):
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        raise ValueError("wav_converter_missing")
    with tempfile.TemporaryDirectory(prefix=".xingye-mimo-") as d:
        i, o = os.path.join(d, "in.wav"), os.path.join(d, "out.mp3")
        with open(i, "wb") as fh:
            fh.write(wav)
        try:
            _media.Deadline(TTS_TOTAL_SECONDS, absolute=deadline).run(
                [ffmpeg, "-nostdin", "-hide_banner", "-loglevel", "error", "-y", "-i", i,
                 "-c:a", "libmp3lame", "-q:a", "3", o],
                check=True, capture_output=True, cap=_tts_remaining(deadline, 60.0))
        except (OSError, subprocess.SubprocessError):
            raise ValueError("mimo_mp3_encode_failed") from None
        with open(o, "rb") as fh:
            return fh.read()


def _fish_or_fallback(text, voice, cfg, deadline):
    try:
        return _fish_mp3(text, cfg["fish"], deadline), "fish", None
    except FishFailed as exc:
        reason = str(exc)
    fb = cfg["fish"]["fallback"]
    trace = _VOICE_TIMING.get()
    if trace is not None:
        trace["fallback"] = fb in {"xai", "mimo"}
    sys.stderr.write("xingye_tts: fish failed (%s), fallback=%s\n" % (reason, fb))
    if fb == "mimo":
        return _mimo_mp3(text, cfg, deadline), "mimo", reason
    if fb == "xai":
        return _gateway_audio(text, voice, deadline), "xai", reason
    raise ValueError("fish_tts_failed")
# ---------------- /HOSINO-FISH-TTS v1 ----------------


@_voice_timing_scope
def synth(text: str, style: str, voice: str, model: str, out: str, output_format=None, _deadline=None, voice_alias=None) -> dict:
    _deadline = time.monotonic() + TTS_TOTAL_SECONDS if _deadline is None else _deadline
    if not isinstance(text, str) or not text or len(text) > 4000:
        raise ValueError("voice_input_invalid")
    selected_voice = voice.strip().lower() if isinstance(voice, str) else ""
    if selected_voice not in SUPPORTED_VOICES:
        raise ValueError("voice_unsupported")
    out, audio_format, ffmpeg = _prepare_output(out, output_format, _deadline)
    # Legacy style/model flags remain accepted, but neither can leak MiMo's
    # payload shape or select a different provider.
    # HOSINO-FISH-TTS v1: provider comes only from the console-written
    # voice-tts.json (default/missing/invalid -> xai, i.e. unchanged behaviour).
    cfg = _load_tts_config()
    trace = _VOICE_TIMING.get()
    if trace is not None:
        trace["requestedProvider"] = cfg["provider"] if cfg["provider"] in {"fish", "xai", "mimo"} else "unknown"
    if cfg["provider"] != "fish":
        text = strip_emotion_markers(text, cfg["fish"]) or text  # HOSINO-VOICE-EMOTION v1
    alias_extra = {}  # HOSINO-VOICE-ALIAS v1: only Fish uses it
    if voice_alias is not None and cfg["provider"] != "fish":
        alias_extra["voiceAliasWarning"] = "voice_alias_ignored_provider_%s" % cfg["provider"]
    elif voice_alias is not None:
        rid, warn = resolve_voice_alias(voice_alias)
        if rid:
            cfg["fish"]["referenceId"] = rid
        if warn:
            alias_extra["voiceAliasWarning"] = warn
    if cfg["provider"] == "fish":
        raw, provider, fell = _fish_or_fallback(text, selected_voice, cfg, _deadline)
    elif cfg["provider"] == "mimo":
        raw, provider, fell = _mimo_mp3(text, cfg, _deadline), "mimo", None
    else:
        # Original xai path: no fallback or retry.
        raw, provider, fell = _gateway_audio(text, selected_voice, _deadline), "xai", None
    if trace is not None:
        trace["synthesizedProvider"] = provider
    _tts_remaining(_deadline)
    result = _publish_native_mp3(raw, out, audio_format, ffmpeg, _deadline)
    extra = {"fallbackFrom": fell} if fell else {}
    extra.update(alias_extra)
    if provider == "fish":
        extra["referenceId"] = cfg["fish"]["referenceId"]
    return {"status": "ok", **result, "model": DEFAULT_MODEL if provider == "xai" else cfg.get(provider, {}).get("model", provider),
            "voice": selected_voice, "provider": provider, **extra}

def main():
    _deadline = time.monotonic() + TTS_TOTAL_SECONDS
    ap = argparse.ArgumentParser(add_help=True)
    ap.add_argument("text", help="要合成的台词")
    ap.add_argument("--out", default=None)
    ap.add_argument("--format", choices=("wav", "mp3"), default=None)
    ap.add_argument("--style", default=DEFAULT_STYLE)
    ap.add_argument("--voice", default=DEFAULT_VOICE)
    ap.add_argument("--model", default=DEFAULT_MODEL)
    ap.add_argument("--repeat", type=int, default=1)
    ap.add_argument("--voice-alias", default=None, help="Fish 音色：别名/中文名/reference id（只对 fish 生效）")
    args = ap.parse_args()
    if args.out is None:
        args.out = "/tmp/xingye_tts_out." + (args.format or "wav")

    if args.repeat < 1:
        ap.error('--repeat must be at least 1')
    for i in range(1, args.repeat + 1):
        if args.repeat > 1:
            base, ext = os.path.splitext(args.out)
            out = "%s_%d%s" % (base, i, ext)
        else:
            out = args.out
        try:
            result = synth(args.text, args.style, args.voice, args.model, out, args.format, _deadline, voice_alias=args.voice_alias)
            print(json.dumps(result, ensure_ascii=False))
        except GatewayOutcomeUnknown:
            print(json.dumps({"status": "uncertain", "error": "gateway_tts_outcome_unknown"}))
            return
        except Exception as exc:  # noqa: BLE001
            print(json.dumps({"status": "error", "out": out, "error": _safe_error(exc)},
                             ensure_ascii=False))
            sys.exit(1)


if __name__ == "__main__":
    main()
