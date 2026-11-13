#!/usr/bin/env python3
"""表情包库管理器（sticker manager）v2 — 多生图后端

逻辑：需要发表情包时先按名称在库里查找；命中直接返回，未命中则生图并按命名规则
      保存到库后返回。

命名规则：
  自动生成：<情绪或动作>-<生图模型>.png|.jpg|.gif
  手动入库：<情绪或动作>-手动入库.png|.jpg|.gif

多后端：
  - doubao/<model>   → 走火山方舟 Ark（scripts/doubao_draw.py）
  - <provider>/<m>   → 走 OpenClaw 原生 image_generate（openclaw infer image generate）
  模型清单与最小像素在 scripts/sticker_models.json 里配置，后期可随时加新模型。

分辨率规则（1:1）：
  - 目标边长 = max(floor_side, 模型最小边长)
  - 模型最小边长：优先用 models.json 里的 min_side；否则由 min_pixels 换算 ceil(sqrt(min_pixels))
  - 若目标边长不在该后端可选正方形尺寸里，向上取最近的可选尺寸
  - floor_side 默认 960（≈720p 的 1280x720 像素量；即边长不低于 720，像素量不低于 720p）
  - 生成后若非正方形则居中裁剪为正方形；若边长 < floor_side 则本地放大到 floor_side

用法：
  python3 sticker_manager.py get  "<情绪或动作>" [提示词] [--model M]
  python3 sticker_manager.py find "<情绪或动作>"
  python3 sticker_manager.py add  "<情绪或动作>" <图片路径>
  python3 sticker_manager.py list ["<关键词>"]
  python3 sticker_manager.py prompt "<情绪或动作>"
  python3 sticker_manager.py models            # 列出已注册生图模型

输出均为 JSON，便于程序/Agent 解析。
"""
import argparse
import json
import math
import os
import shutil
import subprocess
import sys
import tempfile
import hashlib
import re
import time
import media_deadline as _media
from pathlib import Path

# --- 让 PIL 可用：若当前解释器无 PIL，自动用 workspace 的 .venv 重跑 ---
try:
    import PIL  # noqa: F401
    from PIL import Image
except ImportError:  # pragma: no cover
    _venv = Path(__file__).resolve().parent.parent / ".venv" / "bin" / "python"
    if _venv.is_file() and not os.environ.get("STICKER_VENV_REEXEC"):
        os.environ["STICKER_VENV_REEXEC"] = "1"
        os.execv(str(_venv), [str(_venv), __file__, *sys.argv[1:]])
    raise

WORKSPACE = Path(os.environ.get("OPENCLAW_WORKSPACE", "__HS_OPENCLAW_HOME__/workspace"))
LIB = WORKSPACE / "stickers"
REGISTRY = Path(__file__).resolve().parent / "sticker_models.json"
EXTS = (".png", ".jpg", ".jpeg", ".gif", ".webp")
MANUAL_TAG = "手动入库"
DEFAULT_FLOOR_SIDE = 960

# __HS_BOT_NAME__ 官方形象设定（2026-08-29 seedream 5.0-pro 定版）
# 写进默认提示词，保证表情包画的是「星野本猫」而不是通用猫。
# 可用环境变量 STICKER_LOOK 覆盖（置空字符串可关闭外观约束）。
HOSHINO_LOOK = os.environ.get(
    "STICKER_LOOK",
    "角色为__HS_BOT_NAME__本猫：银白色长发配粉色挑染，金色小铃铛项圈，"
    "粉白洛丽塔裙，猫耳与灵活猫尾，粉色蝴蝶结耳机。"
    "画风锁定害羞-gpt-image-1.5：2D赛璐璐Q版大头贴，干净线条，明亮纯色背景，无文字无水印。"
    "不要3D、不要写实、不要换角色。大眼睛软萌，保持该角色一致外观。",
)

sys.path.insert(0, str(Path(__file__).resolve().parent))

# HOSINO-STICKER-PATCH v1: 共享清单 stickers/manifest.json（外观 look/style、分类、文件 sha256）
MANIFEST = LIB / "manifest.json"
DEFAULT_STYLE = "大头贴特写，夸张生动的表情与动作，线条干净，色彩明亮，纯色背景，无文字，正方形构图。"
_MANUAL_N_RE = re.compile(r"^(.*)-" + re.escape(MANUAL_TAG) + r"(\d+)$")


def load_manifest():
    try:
        return json.loads(MANIFEST.read_text(encoding="utf-8"))
    except Exception:
        return None


def _save_manifest(m):
    m["updatedAt"] = int(time.time() * 1000)
    tmp = LIB / (".manifest.json.tmp-%d" % os.getpid())
    tmp.write_text(json.dumps(m, ensure_ascii=False, indent=1), encoding="utf-8")
    os.chmod(tmp, 0o644)
    os.replace(tmp, MANIFEST)


def _sha256(p: Path) -> str:
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for b in iter(lambda: f.read(1 << 20), b""):
            h.update(b)
    return h.hexdigest()


def manifest_register(path: Path, key: str, source: str):
    """把新文件登记进清单（清单不存在就跳过）。"""
    m = load_manifest()
    if not m:
        return
    m.setdefault("categories", {}).setdefault(key, {"desc": "", "scene": "", "synonyms": [], "enabled": True})
    m.setdefault("files", {})[path.name] = {"category": key, "sha256": _sha256(path), "size": path.stat().st_size, "source": source, "addedAt": int(time.time() * 1000)}
    _save_manifest(m)


def current_look():
    if "STICKER_LOOK" in os.environ:
        return os.environ["STICKER_LOOK"]
    m = load_manifest() or {}
    v = m.get("look")
    return v if isinstance(v, str) else HOSHINO_LOOK


def current_style():
    m = load_manifest() or {}
    v = m.get("style")
    return v if isinstance(v, str) and v.strip() else DEFAULT_STYLE


# --------------------------------------------------------------------------- #
# 模型注册表
# --------------------------------------------------------------------------- #
def load_registry():
    reg = {"default": "doubao/doubao-seedream-4-5-251128", "floor_side": DEFAULT_FLOOR_SIDE, "models": {}}
    if REGISTRY.is_file():
        try:
            reg.update(json.loads(REGISTRY.read_text(encoding="utf-8")))
        except Exception as e:  # 配置坏了也不致命
            reg["_load_error"] = str(e)
    return reg


def resolve_model(ref, reg):
    """把 ref 解析成 {ref, provider, model_id, min_side, min_pixels, square_sizes}"""
    models = reg.get("models", {})
    entry = dict(models.get(ref, {}))
    entry["ref"] = ref
    provider, _, model_id = ref.partition("/")
    entry.setdefault("provider", provider if _ else provider)
    entry.setdefault("model_id", model_id or provider)
    return entry


def target_side(entry, floor_side):
    """按模型最小像素算目标正方形边长。"""
    if entry.get("min_side"):
        mn = int(entry["min_side"])
    elif entry.get("min_pixels"):
        mn = math.ceil(math.sqrt(int(entry["min_pixels"])))
    else:
        mn = 0
    desired = max(int(floor_side), mn)
    sizes = entry.get("square_sizes") or []
    squares = []
    for s in sizes:
        try:
            w, h = (int(x) for x in s.lower().split("x"))
        except Exception:
            continue
        if w == h:
            squares.append(w)
    if squares:
        bigger = sorted(x for x in squares if x >= desired)
        if bigger:
            return bigger[0], desired
        return max(squares), desired  # 全部偏小，用最大的
    # 无约束：向上取偶数
    return desired + (desired % 2), desired


# --------------------------------------------------------------------------- #
# 生成后端
# --------------------------------------------------------------------------- #
def gen_doubao(entry, prompt, size, _budget=None):
    _budget = _media.Deadline(600.0) if _budget is None else _budget
    import doubao_draw
    model = entry.get("model_id") or doubao_draw.MODEL
    tmp = _sticker_temp()
    doubao_draw.draw(prompt, size, str(tmp), model, _budget=_budget)
    return tmp, model


def gen_openclaw(entry, prompt, size, _budget=None):
    _budget = _media.Deadline(600.0) if _budget is None else _budget
    ref = entry["ref"]
    tmp = _sticker_temp()
    cmd = [
        "openclaw", "infer", "image", "generate",
        "--model", ref, "--prompt", prompt,
        "--size", size, "--aspect-ratio", "1:1",
        "--output", str(tmp), "--json",
    ]
    timeout = int(os.environ.get("STICKER_GEN_TIMEOUT", "240"))
    proc = _budget.run(cmd, _media.positive_seconds(timeout, 600.0), capture_output=True, text=True)
    if proc.returncode != 0 or not tmp.is_file():
        raise RuntimeError(f"openclaw infer 失败: {proc.stderr.strip()[:500] or proc.stdout.strip()[:500]}")
    return tmp, entry.get("model_id") or ref.split("/")[-1]


def _stringai_grok_cfg():
    """从 openclaw.json 读取 stringai_grok 中转的 baseUrl/apiKey。"""
    import json as _json
    cands = [
        os.environ.get("OPENCLAW_CONFIG"),
        os.environ.get("OPENCLAW_CONFIG_PATH"),
        str(Path(os.environ.get("OPENCLAW_HOME", "__HS_OPENCLAW_HOME__")) / "openclaw.json"),
        "__HS_OPENCLAW_HOME__/openclaw.json",
        # Beijing fallback (kept intentionally):
        "__HS_OPENCLAW_HOME__/openclaw.json",
    ]
    for c in cands:
        if c and Path(c).is_file():
            d = _json.loads(Path(c).read_text(encoding="utf-8"))
            p = (d.get("models", {}).get("providers", {}) or {}).get("stringai_grok")
            if p and p.get("baseUrl") and p.get("apiKey"):
                return {"baseUrl": p["baseUrl"], "apiKey": p["apiKey"]}
    raise RuntimeError("未找到 stringai_grok 中转配置（models.providers.stringai_grok）")


def gen_stringai_grok(entry, prompt, size, _budget=None):
    _budget = _media.Deadline(600.0) if _budget is None else _budget
    """Grok 系图像（grok-imagine / grok-imagine-image），走 stringai 中转的
    OpenAI 兼容 /images/generations 端点，返回 URL 后下载。"""
    import json as _json
    import urllib.request
    cfg = _stringai_grok_cfg()
    model = entry.get("model_id") or "grok-imagine"
    body = _json.dumps({
        "model": model, "prompt": prompt, "n": 1, "response_format": "b64_json",
    }).encode()
    req = urllib.request.Request(
        cfg["baseUrl"].rstrip("/") + "/images/generations",
        data=body,
        headers={"Authorization": "Bearer " + cfg["apiKey"], "Content-Type": "application/json"},
    )
    timeout = int(os.environ.get("STICKER_GEN_TIMEOUT", "240"))
    import base64
    data = _budget.read_json(req, _media.positive_seconds(timeout, 600.0))
    item = ((data.get("data") or [{}])[0]) or {}
    b64 = item.get("b64_json")
    if b64:
        tmp = _sticker_temp()
        _media.atomic_bytes(tmp, base64.b64decode(b64, validate=True), _budget)
        return tmp, model
    # 回退：若中转只给 URL，再尝试下载
    url = item.get("url")
    if not url:
        raise RuntimeError(f"grok-imagine 未返回图片: {str(data)[:400]}")
    tmp = _sticker_temp()
    _budget.download(url, tmp, _media.positive_seconds(timeout, 600.0), max_bytes=64 * 1024 * 1024)
    return tmp, model


def generate(entry, prompt, size, _budget=None):
    _budget = _media.Deadline(600.0) if _budget is None else _budget
    provider = entry.get("provider", "")
    if provider == "doubao":
        return gen_doubao(entry, prompt, size, _budget)
    if provider in ("stringai_grok", "grok"):
        return gen_stringai_grok(entry, prompt, size, _budget)
    return gen_openclaw(entry, prompt, size, _budget)


# --------------------------------------------------------------------------- #
# 图片规范化
# --------------------------------------------------------------------------- #
def normalize(src: Path, dst: Path, floor_side: int, _budget=None):
    """居中裁剪成正方形；边长不足 floor_side 则放大。返回最终 (w,h)。"""
    im = Image.open(src)
    im = im.convert("RGBA") if im.mode in ("P", "LA") else im
    w, h = im.size
    side = min(w, h)
    left, top = (w - side) // 2, (h - side) // 2
    im = im.crop((left, top, left + side, top + side))
    if im.size[0] < floor_side:
        im = im.resize((floor_side, floor_side), Image.LANCZOS)
    dst.parent.mkdir(parents=True, exist_ok=True)
    _budget = _media.Deadline(600.0) if _budget is None else _budget
    with _media.atomic_path(dst, _budget) as staged:
        im.save(staged)
    return im.size


# --------------------------------------------------------------------------- #
# 库操作
# --------------------------------------------------------------------------- #
def _iter():
    if not LIB.is_dir():
        return []
    return sorted(p for p in LIB.iterdir() if p.is_file() and p.suffix.lower() in EXTS)


def _known_sources():
    """已知来源后缀（模型 id / 手动入库），用于从文件名解析 key。"""
    reg = load_registry()
    srcs = {MANUAL_TAG}
    for ref, e in reg.get("models", {}).items():
        entry = resolve_model(ref, reg)
        if entry.get("model_id"):
            srcs.add(str(entry["model_id"]))
        if "/" in ref:
            srcs.add(ref.split("/", 1)[1])
    return sorted(srcs, key=len, reverse=True)


def parse_name(stem: str):
    stem = re.sub(r"-v\d+$", "", stem)  # HOSINO-STICKER-PATCH v1.1: <分类>-<模型>-v<n>
    mm = _MANUAL_N_RE.match(stem)  # HOSINO-STICKER-PATCH v1: <分类>-手动入库<n>
    if mm:
        return mm.group(1), MANUAL_TAG
    # 先按已知来源（可能含连字符，如 doubao-seedream-4-5-251128）匹配
    for s in _known_sources():
        if stem.endswith("-" + s):
            return stem[: -(len(s) + 1)], s
    if stem.endswith("-" + MANUAL_TAG):
        return stem[: -(len(MANUAL_TAG) + 1)], MANUAL_TAG
    if "-" in stem:
        k, _, s = stem.rpartition("-")
        return k, s
    return stem, ""


def _has_cjk(s: str) -> bool:
    return any("\u4e00" <= ch <= "\u9fff" for ch in s)


def _style_rank(path: Path, prefer_cjk: bool = False) -> tuple:
    """Prefer GPT cel-shaded stickers (害羞-gpt-image-1.5 baseline) over doubao/grok.
    Stickers with Chinese text prefer gpt-image-2."""
    stem = path.stem.lower()
    if prefer_cjk:
        if "gpt-image-2" in stem:
            return (0, stem)
        if "gpt-image-1.5" in stem:
            return (1, stem)
    else:
        if "gpt-image-1.5" in stem:
            return (0, stem)
        if "gpt-image-2" in stem:
            return (1, stem)
    if "gpt-image" in stem:
        return (2, stem)
    if "doubao" in stem or "seedream" in stem:
        return (8, stem)
    if "grok" in stem:
        return (9, stem)
    return (5, stem)


def find(key: str):
    prefer_cjk = _has_cjk(key)
    exact, prefix, fuzzy = [], [], []
    for p in _iter():
        stem = p.stem
        if stem == key:
            exact.append(p)
        elif stem.startswith(key + "-"):
            prefix.append(p)
        elif key in stem:
            fuzzy.append(p)
    rank = lambda p: _style_rank(p, prefer_cjk=prefer_cjk)
    return sorted(exact, key=rank) + sorted(prefix, key=rank) + sorted(fuzzy, key=rank)


def sticker_prompt(key: str) -> str:
    look = (current_look() or "").strip()
    look_part = f"{look}" if look else "单只可爱猫娘。"
    return (
        f"二次元萌系表情包贴纸，主题：{key}。"
        f"{look_part}"
        + current_style()
    )


def out(status="ok", **kw):
    print(json.dumps({"status": status, **kw}, ensure_ascii=False))


# --------------------------------------------------------------------------- #
# 命令
# --------------------------------------------------------------------------- #
def cmd_models(model=None):
    reg = load_registry()
    items = []
    for ref, e in reg.get("models", {}).items():
        entry = resolve_model(ref, reg)
        side, desired = target_side(entry, reg.get("floor_side", DEFAULT_FLOOR_SIDE))
        items.append({"ref": ref, "provider": entry.get("provider"),
                      "min_side": entry.get("min_side"), "min_pixels": entry.get("min_pixels"),
                      "square_size": f"{side}x{side}", "is_default": ref == reg.get("default")})
    out(default=reg.get("default"), floor_side=reg.get("floor_side", DEFAULT_FLOOR_SIDE), models=items)
    return 0


def cmd_find(key):
    hits = find(key)
    if hits:
        out(found=True, key=key, path=str(hits[0]), matches=[str(x) for x in hits])
        return 0
    out(found=False, key=key)
    return 1


_STICKER_TEMPORARIES = []


def _sticker_file_component(value):
    if not isinstance(value, str) or not value or value in (".", "..") or any(char in value for char in ("/", "\\", "\x00", "\r", "\n")):
        raise ValueError("sticker_filename_component_invalid")
    return value


def _sticker_temp():
    directory = tempfile.TemporaryDirectory(prefix=".qq-sticker-")
    _STICKER_TEMPORARIES.append(directory)
    return Path(directory.name) / "out.png"


def _cleanup_sticker_temporaries():
    while _STICKER_TEMPORARIES:
        _STICKER_TEMPORARIES.pop().cleanup()


def cmd_get(key, prompt=None, model=None, new=False):
    _sticker_file_component(key)
    _budget = _media.Deadline(600.0)
    hits = [] if new else find(key)  # HOSINO-STICKER-PATCH v1.1
    if hits:
        out(source="library", key=key, path=str(hits[0]))
        return 0
    reg = load_registry()
    # 模型优先链：显式 --model 只用该模型；否则用 default_chain（逐个降级）
    if model:
        chain = [model]
    else:
        chain = list(reg.get("default_chain") or [reg.get("default")])
        # 画面带中文时优先 gpt-image-2
        if _has_cjk(key) and "openai/gpt-image-2" in chain:
            chain = ["openai/gpt-image-2"] + [x for x in chain if x != "openai/gpt-image-2"]
    prompt_final = prompt or sticker_prompt(key)
    errors = []
    for ref in chain:
        if not ref:
            continue
        entry = resolve_model(ref, reg)
        side, desired = target_side(entry, reg.get("floor_side", DEFAULT_FLOOR_SIDE))
        size = f"{side}x{side}"
        try:
            src, model_id = generate(entry, prompt_final, size, _budget)
        except Exception as e:  # 当前后端失败 → 落下一个
            errors.append({"ref": ref, "error": str(e)[:300]})
            _cleanup_sticker_temporaries()
            continue
        target = LIB / f"{key}-{_sticker_file_component(model_id)}.png"
        if new:  # HOSINO-STICKER-PATCH v1.1
            n = 2
            while target.exists():
                target = LIB / f"{key}-{_sticker_file_component(model_id)}-v{n}.png"
                n += 1
        if target.exists():
            out(source="library", key=key, path=str(target), chain_tried=[e["ref"] for e in errors])
            return 0
        final = normalize(src, target, reg.get("floor_side", DEFAULT_FLOOR_SIDE), _budget)
        try:
            manifest_register(target, key, "generated:" + str(model_id))  # HOSINO-STICKER-PATCH v1
        except Exception:
            pass
        out(source="generated", key=key, model=model_id, ref=ref, requested=size,
            final=f"{final[0]}x{final[1]}", path=str(target),
            chain_tried=[e["ref"] for e in errors])
        return 0
    out(status="error", error="所有模型均失败", attempts=errors)
    return 1


def cmd_add(key, src):
    # HOSINO-STICKER-PATCH v1: 统一命名 <分类>-手动入库[<n>]、sha256 去重、绝不覆盖
    _sticker_file_component(key)
    if "-" in key or key.startswith(".") or len(key) > 16:
        out(status="error", error="分类名不能含 '-'、不能以 '.' 开头、最长 16 字")
        return 1
    src = Path(src).expanduser()
    if not src.is_file():
        out(status="error", error=f"文件不存在: {src}")
        return 1
    ext = src.suffix.lower()
    if ext not in EXTS:
        out(status="error", error=f"不支持的扩展名: {ext}，可用 {list(EXTS)}")
        return 1
    LIB.mkdir(parents=True, exist_ok=True)
    digest = _sha256(src)
    for p in _iter():
        if p.stat().st_size == src.stat().st_size and _sha256(p) == digest:
            out(status="duplicate", key=key, path=str(p), sha256=digest)
            return 0
    n = 1
    while True:
        target = LIB / (f"{key}-{MANUAL_TAG}{ext}" if n == 1 else f"{key}-{MANUAL_TAG}{n}{ext}")
        if not any((LIB / (target.stem + e)).exists() for e in EXTS):
            break
        n += 1
    tmp = LIB / (".add-tmp-%d%s" % (os.getpid(), ext))
    shutil.copy2(src, tmp)
    try:
        os.link(tmp, target)  # 目标已存在会失败，不会覆盖
    finally:
        tmp.unlink(missing_ok=True)
    manifest_register(target, key, "manual")
    out(source="manual", key=key, path=str(target), sha256=digest)
    return 0


def cmd_list(keyword=None):
    items = []
    for p in _iter():
        if keyword and keyword not in p.stem:
            continue
        k, s = parse_name(p.stem)
        items.append({"key": k, "source": s, "file": p.name})
    out(count=len(items), library=str(LIB), items=items)
    return 0


def main():
    ap = argparse.ArgumentParser(description="表情包库管理器 v2")
    sub = ap.add_subparsers(dest="cmd", required=True)

    p_get = sub.add_parser("get", help="查找，未命中则生图并保存")
    p_get.add_argument("key")
    p_get.add_argument("prompt", nargs="?", default=None)
    p_get.add_argument("--model", default=None)
    p_get.add_argument("--new", action="store_true", help="库里已有也再生成一张（控制台用）")

    p_find = sub.add_parser("find", help="仅查找")
    p_find.add_argument("key")

    p_add = sub.add_parser("add", help="手动入库")
    p_add.add_argument("key")
    p_add.add_argument("path")

    p_list = sub.add_parser("list", help="列出库内容")
    p_list.add_argument("keyword", nargs="?", default=None)

    p_prompt = sub.add_parser("prompt", help="打印默认提示词")
    p_prompt.add_argument("key")

    sub.add_parser("models", help="列出生图模型注册表")

    args = ap.parse_args()
    if args.cmd == "get":
        try:
            return cmd_get(args.key, args.prompt, args.model, args.new)
        finally:
            _cleanup_sticker_temporaries()
    if args.cmd == "find":
        return cmd_find(args.key)
    if args.cmd == "add":
        return cmd_add(args.key, args.path)
    if args.cmd == "list":
        return cmd_list(args.keyword)
    if args.cmd == "prompt":
        print(sticker_prompt(args.key))
        return 0
    if args.cmd == "models":
        return cmd_models()
    return 2


if __name__ == "__main__":
    sys.exit(main())
