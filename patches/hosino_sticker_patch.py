#!/usr/bin/python3
# HOSINO-STICKER-PATCH v1 — 可重复执行、幂等。用法: hosino_sticker_patch.py [--dry-run]
import sys, os, re, json, hashlib, shutil, time, pwd
DRY = "--dry-run" in sys.argv
H = "/home/ubuntu/.openclaw"
W = H + "/workspace"
QQ = open(H + "/backups/pre-opt-batch-20261006-181708/QQBOT_DIR.txt").read().strip() + "/dist/index.cjs"
GATE = H + "/plugins/qq-group-followup-gate/index.js"
SM = W + "/scripts/sticker_manager.py"
SKILL = H + "/agents/main/agent/workshop-skills/qq-group-sticker/SKILL.md"
AGENTS = W + "/AGENTS.md"
PLAY = W + "/docs/STICKER_PLAYBOOK.md"
BK = "/root/hosino-backup-20261020-sticker"
MARK = "HOSINO-STICKER-PATCH v1"
U = pwd.getpwnam("ubuntu")
sha = lambda b: hashlib.sha256(b).hexdigest()

def backup(f):
    os.makedirs(BK, exist_ok=True)
    dst = BK + "/" + f.replace("/", "__")
    if not os.path.exists(dst):
        shutil.copy2(f, dst)
        with open(BK + "/SHA256SUMS", "a") as o: o.write(f"{sha(open(f,'rb').read())}  {f}\n")

def write(f, s):
    st = os.stat(f)
    if DRY: print("would write", f, len(s)); return
    backup(f)
    tmp = f + ".hs-tmp"
    open(tmp, "w").write(s); os.chown(tmp, st.st_uid, st.st_gid); os.chmod(tmp, st.st_mode & 0o7777); os.replace(tmp, f)
    print("patched", f)

def rep(s, a, b, f):
    if s.count(a) != 1: raise SystemExit(f"anchor not unique/missing in {f}: {a[:60]!r} count={s.count(a)}")
    return s.replace(a, b)

# ---------------- gate index.js ----------------
s = open(GATE).read()
if MARK not in s:
    s = rep(s, "let stickerKeyCache = {", '''/* HOSINO-STICKER-PATCH v1: stickers/params.json + manifest.json (5s refresh, mtime-keyed) */
const HS_STK = { at: 0, dir: "", params: null, manifest: null, pm: -1, mm: -1 };
function hsStk(dir) {
  if (HS_STK.dir === dir && Date.now() - HS_STK.at < 5000) return HS_STK;
  const rd = (f, prev, pm) => { try { const st = fs.statSync(f); if (st.mtimeMs === pm && HS_STK.dir === dir) return [prev, pm]; return [JSON.parse(fs.readFileSync(f, "utf8")), st.mtimeMs]; } catch { return [null, -1]; } };
  const [p, pm] = rd(path.join(dir, "params.json"), HS_STK.params, HS_STK.pm);
  const [m, mm] = rd(path.join(dir, "manifest.json"), HS_STK.manifest, HS_STK.mm);
  Object.assign(HS_STK, { at: Date.now(), dir, params: p, manifest: m, pm, mm });
  return HS_STK;
}
function hsHm(tz) { try { const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: tz || "Asia/Singapore", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date()).map((x) => [x.type, x.value])); return `${p.hour}:${p.minute}`; } catch { return ""; } }
function hsQuiet(q) { if (!q || !q.start || !q.end || q.start === q.end) return false; const n = hsHm(q.tz); if (!n) return false; return q.start < q.end ? n >= q.start && n < q.end : n >= q.start || n < q.end; }
function hsSess(p, id) { const e = p?.sessions?.[id]; return e && typeof e === "object" ? e : null; }
let stickerKeyCache = {''', GATE)
    old_blk = '''  if (keys.length) {
    if (sGap != null && sGap < Number(cfg.stickerCooldownReplies)) parts.push("刚发过表情包，这轮不发");'''
    new_blk = '''  const hsS = hsStk(cfg.stickerDir); const HP = hsS.params; let hsAttach = false;
  if (keys.length && HP) {
    /* HOSINO-STICKER-PATCH v1: code decides per turn; model only picks the category */
    const cats = hsS.manifest?.categories || {};
    const ok = keys.filter((k) => cats[k]?.enabled !== false);
    const se = hsSess(HP, "group:" + gid.toLowerCase());
    const on = HP.enabled !== false && (se ? se.enabled !== false : !!HP.defaultEnabled);
    const cool = Number.isFinite(Number(HP.cooldownReplies)) ? Number(HP.cooldownReplies) : Number(cfg.stickerCooldownReplies);
    const prob = Number.isFinite(Number(se?.probability)) ? Number(se.probability) : Number(HP.attachProbability ?? 0);
    if (!on || hsQuiet(HP.quietHours) || !ok.length) parts.push("这轮不发表情包，不要写 && 标签");
    else if (sGap != null && sGap < cool) parts.push("刚发过表情包，这轮不发，不要写 && 标签");
    else if (Math.random() < prob) {
      hsAttach = true;
      const notes = ok.map((k) => cats[k]?.scene ? `${k}=${cats[k].scene}` : k).join("；");
      parts.push(`这一轮请带一个表情包：在回复最后单独一行写 &&分类&&，按当前语境选最贴切的一个（${notes}）${HP.genEnabled !== false ? "；都不合适时可以写一个新的 2–4 字分类名，会在后台画好后补发" : ""}。如果这轮保持沉默，或者内容严肃（报错、隐私、认真安慰）就不带`);
    } else parts.push("这轮不发表情包，不要写 && 标签");
  } else if (keys.length) {
    if (sGap != null && sGap < Number(cfg.stickerCooldownReplies)) parts.push("刚发过表情包，这轮不发");'''
    s = rep(s, old_blk, new_blk, GATE)
    old_ret = "  return `【表情/语音·少用】大多数回复不带任何标记，只有明显能加分时才用；一条回复最多一个：表情包和语音二选一，绝不同时用。${parts.join(\"；\")}。保持沉默时不要加；绝不提及或解释这些标记。`;"
    new_ret = "  if (hsAttach) return `【表情/语音】一条回复最多一个：表情包和语音二选一，绝不同时用。${parts.join(\"；\")}。保持沉默时不要加；绝不提及或解释这些标记。`;\n" + old_ret
    s = rep(s, old_ret, new_ret, GATE)
    write(GATE, s)
else: print("gate already patched")

# ---------------- qqbot dist ----------------
s = open(QQ).read()
if MARK not in s:
    s = rep(s, "var __qqMtCatCache = {", '''/* HOSINO-STICKER-PATCH v1: recheck stickers/params.json + manifest.json before sending (5s refresh) */
var __hsStkC = { at: 0, dir: "", params: null, manifest: null, pm: -1, mm: -1, syn: new Map() };
function __hsStk(dir) {
  if (__hsStkC.dir === dir && Date.now() - __hsStkC.at < 5000) return __hsStkC;
  const rd = (f, prev, pm) => { try { const st = __qqMtFs.statSync(f); if (st.mtimeMs === pm && __hsStkC.dir === dir) return [prev, pm]; return [JSON.parse(__qqMtFs.readFileSync(f, "utf8")), st.mtimeMs]; } catch { return [null, -1]; } };
  const [p, pm] = rd(__qqMtPath.join(dir, "params.json"), __hsStkC.params, __hsStkC.pm);
  const [m, mm] = rd(__qqMtPath.join(dir, "manifest.json"), __hsStkC.manifest, __hsStkC.mm);
  const syn = new Map();
  try { for (const [c, v] of Object.entries(m?.categories || {})) for (const w of (v?.synonyms || [])) { const n = __qqMtNorm(w); if (n && !syn.has(n)) syn.set(n, c); } } catch {}
  __hsStkC = { at: Date.now(), dir, params: p, manifest: m, pm, mm, syn };
  return __hsStkC;
}
function __hsQuiet(q) {
  if (!q || !q.start || !q.end || q.start === q.end) return false;
  let n = ""; try { const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: q.tz || "Asia/Singapore", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date()).map((x) => [x.type, x.value])); n = `${p.hour}:${p.minute}`; } catch { return false; }
  return q.start < q.end ? n >= q.start && n < q.end : n >= q.start || n < q.end;
}
function __hsBlock(dir, gid, key) {
  const c = __hsStk(dir); const p = c.params; if (!p) return "";
  if (p.enabled === false) return "off";
  const se = p.sessions?.["group:" + String(gid).toLowerCase()];
  if (se ? se.enabled === false : !p.defaultEnabled) return "session-off";
  if (__hsQuiet(p.quietHours)) return "quiet-hours";
  if (c.manifest?.categories?.[key]?.enabled === false) return "category-off";
  return "";
}
/* HOSINO-STICKER-PATCH v1: auto-generate missing category in background (genEnabled/genDailyCap) */
var __hsGenBusy = false;
function __hsGenKey(raw) { const k = String(raw || "").normalize("NFKC").replace(/[\\s&＆:：\\[\\]【】]/g, ""); return /^[\\p{Script=Han}A-Za-z0-9]{1,8}$/u.test(k) ? k : ""; }
function __hsGenAllowed(dir, gid) {
  const c = __hsStk(dir); const p = c.params; if (!p || p.genEnabled === false) return "gen-off";
  const b = __hsBlock(dir, gid, ""); if (b) return b;
  if (__hsGenBusy) return "gen-busy";
  const f = __qqMtPath.join(dir, ".gen-state.json"); let s = {}; try { s = JSON.parse(__qqMtFs.readFileSync(f, "utf8")); } catch {}
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: p.quietHours?.tz || "Asia/Singapore" }).format(new Date());
  const cap = Number.isFinite(Number(p.genDailyCap)) ? Number(p.genDailyCap) : 10;
  if (s.day === day && (s.count || 0) >= cap) return `gen-cap ${s.count}/${cap}`;
  return "";
}
function __hsGenCount(dir) {
  const p = __hsStk(dir).params || {}; const f = __qqMtPath.join(dir, ".gen-state.json"); let s = {}; try { s = JSON.parse(__qqMtFs.readFileSync(f, "utf8")); } catch {}
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: p.quietHours?.tz || "Asia/Singapore" }).format(new Date());
  s = s.day === day ? { day, count: (s.count || 0) + 1 } : { day, count: 1 };
  try { const t = f + ".tmp"; __qqMtFs.writeFileSync(t, JSON.stringify(s)); __qqMtFs.renameSync(t, f); } catch {}
}
function __hsGenRun(cfg, key, deliverCtx, info) {
  __hsGenBusy = true; __hsGenCount(cfg.stickerDir); const t0 = Date.now();
  info(`sticker gen start key=${key}`);
  __qqMtCp.execFile("python3", [__qqMtPath.join(cfg.workspace, "scripts", "sticker_manager.py"), "get", key], { cwd: cfg.workspace, timeout: 300000, maxBuffer: 1 << 20 }, async (err, stdout) => {
    try {
      let j = null; try { j = JSON.parse(String(stdout || "").trim().split("\\n").pop()); } catch {}
      if (err || !j || j.status !== "ok" || !j.path) { info(`sticker gen failed key=${key} ms=${Date.now() - t0}: ${err?.message || j?.error || "no path"}`); return; }
      __qqMtCatCache.at = 0;
      const st = __qqMtFs.statSync(j.path);
      const ent = { key, name: __qqMtPath.basename(j.path), file: j.path, size: st.size, mtimeMs: st.mtimeMs };
      const { src } = __qqMtStickerSrc(ent, cfg);
      const r = await deliverCtx.sendMedia(deliverCtx.qualifiedTarget, src, { text: "" });
      info(r && !r.error ? `sticker=${key} file=${ent.name} generated+sent ms=${Date.now() - t0} source=${j.source}` : `sticker gen send failed key=${key}: ${r?.error}`);
    } catch (e) { info(`sticker gen error key=${key}: ${e?.message || e}`); }
    finally { __hsGenBusy = false; }
  });
}
var __qqMtCatCache = {''', QQ)
    s = rep(s, "  const syn = __QQMT_SYN_REV.get(k);\n", "  const syn = __QQMT_SYN_REV.get(k);\n  { const ms = __hsStkC.syn.get(k); if (ms && cats.has(ms)) return ms; } /* HOSINO-STICKER-PATCH v1 */\n", QQ)
    s = rep(s, "  const cfg = __qqMtCfg(account);\n", "  const cfg = __qqMtCfg(account);\n  try { const hp = __hsStk(cfg.stickerDir).params; const v = Math.floor(Number(hp?.cooldownReplies)); if (hp && Number.isFinite(v)) cfg.stickerCooldownReplies = Math.max(0, Math.min(100, v)); } catch {} /* HOSINO-STICKER-PATCH v1 */\n", QQ)
    s = rep(s, "        else if (!sn.stickerOk) info(", "        else if ((__hsWhy = __hsBlock(cfg.stickerDir, gid, want.key))) info(`sticker blocked by params (${__hsWhy}) key=${want.key}`); /* HOSINO-STICKER-PATCH v1 */\n        else if (!sn.stickerOk) info(", QQ)
    s = rep(s, "      const sn = snapshot();\n      let sticker = null;\n", "      const sn = snapshot();\n      let sticker = null;\n      let __hsWhy = \"\";\n      let genSticker = null; /* HOSINO-STICKER-PATCH v1 */\n      if (!p.stickers.some((x) => x.key) && p.stickers.length && cfg.stickers && sn.stickerOk && !st.voiceUsed && !st.otherMedia) { const gk = __hsGenKey(p.stickers[0].raw); const why = gk ? __hsGenAllowed(cfg.stickerDir, gid) : \"bad-key\"; if (why) info(`sticker gen skipped raw=${JSON.stringify(p.stickers[0].raw)} (${why})`); else { genSticker = { key: gk }; st.stickerUsed = true; } }\n", QQ)
    s = rep(s, "      return { changed: true, text: outText, sticker, voice, silent: false };\n", "      return { changed: true, text: outText, sticker, voice, silent: false, genSticker };\n", QQ)
    s = rep(s, "      if (!prep || prep.silent) return res;\n", "      if (!prep || prep.silent) return res;\n      if (prep.genSticker) { try { __hsGenRun(cfg, prep.genSticker.key, deliverCtx, info); } catch (e) { info(`sticker gen spawn error: ${e?.message || e}`); } } /* HOSINO-STICKER-PATCH v1: background, text already sent */\n", QQ)
    write(QQ, s)
else: print("qqbot already patched")

# ---------------- sticker_manager.py ----------------
s = open(SM).read()
if MARK not in s:
    s = rep(s, "sys.path.insert(0, str(Path(__file__).resolve().parent))\n", '''sys.path.insert(0, str(Path(__file__).resolve().parent))

# HOSINO-STICKER-PATCH v1: 共享清单 stickers/manifest.json（外观 look/style、分类、文件 sha256）
MANIFEST = LIB / "manifest.json"
DEFAULT_STYLE = "大头贴特写，夸张生动的表情与动作，线条干净，色彩明亮，纯色背景，无文字，正方形构图。"
_MANUAL_N_RE = re.compile(r"^(.*)-" + re.escape(MANUAL_TAG) + r"(\\d+)$")


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
''', SM)
    s = rep(s, "import tempfile\n", "import tempfile\nimport hashlib\nimport re\nimport time\n", SM)
    s = rep(s, "def parse_name(stem: str):\n", "def parse_name(stem: str):\n    mm = _MANUAL_N_RE.match(stem)  # HOSINO-STICKER-PATCH v1: <分类>-手动入库<n>\n    if mm:\n        return mm.group(1), MANUAL_TAG\n", SM)
    s = rep(s, '''    look = (HOSHINO_LOOK or "").strip()''', '''    look = (current_look() or "").strip()''', SM)
    s = rep(s, '''        "大头贴特写，夸张生动的表情与动作，"
        "线条干净，色彩明亮，纯色背景，无文字，正方形构图。"''', '''        + current_style()''', SM)
    old_add = s[s.index("def cmd_add(key, src):"):s.index("def cmd_list(keyword=None):")]
    new_add = '''def cmd_add(key, src):
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


'''
    s = s.replace(old_add, new_add)
    s = rep(s, '''        final = normalize(src, target, reg.get("floor_side", DEFAULT_FLOOR_SIDE), _budget)
''', '''        final = normalize(src, target, reg.get("floor_side", DEFAULT_FLOOR_SIDE), _budget)
        try:
            manifest_register(target, key, "generated:" + str(model_id))  # HOSINO-STICKER-PATCH v1
        except Exception:
            pass
''', SM)
    write(SM, s)
else: print("sticker_manager already patched")

# ---------------- docs ----------------
s = open(SKILL).read()
if MARK not in s:
    s += '''
## 清单、参数与生图（HOSINO-STICKER-PATCH v1，2026-10-20）

- 库：`workspace/stickers/`；文件名 `<分类>-<来源>.<后缀>`，来源是生图模型 id 或 `手动入库[<序号>]`。分类不含 `-`。
- 清单 `stickers/manifest.json`：顶层 `look`（星野官方外观）和 `style`（表情包画风），`categories`（每类的含义 desc、适用场景 scene、同义词 synonyms、enabled），`files`（文件 → 分类、sha256、来源）。控制台、生图脚本和标签补丁都读这一份。
- 参数 `stickers/params.json`：总开关、每轮配图概率、冷却回复数、静默时段、按会话开关。**由代码执行**：每轮发不发、能不能发由插件决定，提示里出现“这一轮请带一个表情包”才带；说“不发”就不要写 `&&` 标签。
- 生图：`./scripts/sticker_manager.py get "<分类>"` 先查库，没有才按清单里的 `look` + `style` 生成（模型链见 `scripts/sticker_models.json`），保存为 `<分类>-<模型id>.png` 并自动登记进清单。
- 群聊自动生图：标签写了库里没有的分类（且映射不到已有分类或近义词）时，qqbot 补丁会先发文字，再在后台跑 `get`，生成后自动补发并入库。受 params.json 的 `genEnabled`（默认开）、`genDailyCap`（默认每天 10 张）、会话开关、静默时段和冷却限制，同一时间只生成一张。日志 `sticker gen ...`。
- 有人明确要某个新表情时，也可以自己跑 `get` 再用 message 发。
- 入库：`./scripts/sticker_manager.py add "<分类>" <图片>`：按 sha256 去重，重复就返回 `status=duplicate`；新文件命名 `<分类>-手动入库[<n>]`，绝不覆盖。
- 不要手改 manifest.json / params.json；凛会在控制台里改。
'''
    write(SKILL, s)
else: print("skill already patched")
s = open(AGENTS).read()
if MARK not in s:
    a = "- **表情包/语音标签（群聊，2026-10-06）**：每轮提示里会给出可用表情包分类。想配表情包就在回复**最后单独一行**写 `&&分类&&`（只用提示里列出的分类，最多 1 个）；"
    b = "- **表情包/语音标签（群聊，2026-10-06；2026-10-20 改为代码决定）**：发不发表情包由插件按概率/冷却/静默时段/会话开关决定（`stickers/params.json`，HOSINO-STICKER-PATCH v1）：提示说“这一轮请带一个表情包”时，就在回复**最后单独一行**写 `&&分类&&`，按提示里的场景说明选（最多 1 个）；提示说“这轮不发”就不要写标签。"
    s = rep(s, a, b, AGENTS)
    a2 = "群聊日常配图/语音**用标签，不要再跑 exec 脚本或 `sticker_manager.py get`**（get 会现场生图要 1~2 分钟）；"
    b2 = "群聊日常配图/语音**用标签**；库里没有合适分类时，可以直接写一个新的 2–4 字分类名标签（先尽量用已有分类和近义词），代码会在后台用 `sticker_manager.py get` 按统一外观生图、入库并在 1–2 分钟后补发（受 params.json 的 genEnabled/genDailyCap 限制），**不要自己跑 exec 或 get**；"
    s = rep(s, a2, b2, AGENTS)
    write(AGENTS, s)
else: print("agents already patched")
s = open(PLAY).read()
if MARK not in s:
    s += '''
## 2026-10-20 更新（HOSINO-STICKER-PATCH v1）

- 新增 `stickers/manifest.json`（外观 look/style、分类含义/场景/同义词/开关、文件 sha256）和 `stickers/params.json`（enabled、attachProbability、cooldownReplies、quietHours、defaultEnabled、sessions）。两者都会在 5 秒内生效，不用改 openclaw.json，也不用重载。
- 群聊每轮由 followup-gate 决定要不要让她带表情：会话开着、不在静默时段、过了冷却，再按概率掷一次，中了就在提示里明确要求带一个并附上场景说明。qqbot 发送前会再检查一次会话开关、静默时段和分类开关（日志 `sticker blocked by params (...)`），冷却数以 params 为准。
- 上文“冷却 2 / 约 6 条提示”已过时：现在冷却看 params.cooldownReplies，nudge 提示不再使用（有 params 时）。
- `sticker_manager.py add` 按 sha256 去重，命名 `<分类>-手动入库[<n>]`，不再覆盖；`get` 生成的新图会自动登记进清单；外观提示词从清单的 look/style 读取（环境变量 STICKER_LOOK 仍优先）。
- 潜水表情（lurkSticker）行为不变。
- 补丁脚本：服务器 `/root/hosino-patches/hosino_sticker_patch.py`（幂等，qqbot 升级后重跑即可）。
'''
    write(PLAY, s)
else: print("playbook already patched")

# ---------------- v1.1: sticker_manager get --new（控制台“再生成一张”，命名 <分类>-<模型>-v<n>）----------------
s = open(SM).read()
M2 = "HOSINO-STICKER-PATCH v1.1"
if M2 not in s:
    s = rep(s, "    mm = _MANUAL_N_RE.match(stem)  # HOSINO-STICKER-PATCH v1: <分类>-手动入库<n>\n",
        "    stem = re.sub(r\"-v\\d+$\", \"\", stem)  # HOSINO-STICKER-PATCH v1.1: <分类>-<模型>-v<n>\n    mm = _MANUAL_N_RE.match(stem)  # HOSINO-STICKER-PATCH v1: <分类>-手动入库<n>\n", SM)
    s = rep(s, "def cmd_get(key, prompt=None, model=None):\n", "def cmd_get(key, prompt=None, model=None, new=False):\n", SM)
    s = rep(s, "    hits = find(key)\n    if hits:\n        out(source=\"library\", key=key, path=str(hits[0]))\n        return 0\n    reg = load_registry()",
        "    hits = [] if new else find(key)  # HOSINO-STICKER-PATCH v1.1\n    if hits:\n        out(source=\"library\", key=key, path=str(hits[0]))\n        return 0\n    reg = load_registry()", SM)
    s = rep(s, "        target = LIB / f\"{key}-{_sticker_file_component(model_id)}.png\"\n        if target.exists():\n",
        "        target = LIB / f\"{key}-{_sticker_file_component(model_id)}.png\"\n        if new:  # HOSINO-STICKER-PATCH v1.1\n            n = 2\n            while target.exists():\n                target = LIB / f\"{key}-{_sticker_file_component(model_id)}-v{n}.png\"\n                n += 1\n        if target.exists():\n", SM)
    s = rep(s, "    p_get.add_argument(\"--model\", default=None)\n", "    p_get.add_argument(\"--model\", default=None)\n    p_get.add_argument(\"--new\", action=\"store_true\", help=\"库里已有也再生成一张（控制台用）\")\n", SM)
    s = rep(s, "return cmd_get(args.key, args.prompt, args.model)", "return cmd_get(args.key, args.prompt, args.model, args.new)", SM)
    write(SM, s)
else: print("sticker_manager v1.1 already patched")
