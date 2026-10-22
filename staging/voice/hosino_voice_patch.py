#!/usr/bin/python3
# HOSINO-VOICE-PARAMS v1 — 群聊语音改成代码决定（stickers/params.json 的 voice 段）。
# 用法: hosino_voice_patch.py --check | --apply | --revert | --register-manifest | --unregister-manifest
#   环境变量 HS_ROOT=<目录> 把所有绝对路径加前缀（离线测试用，默认空=线上路径）。
# 幂等；已打过就跳过。--apply 前自动备份到 BK；--revert 只在文件仍等于本补丁写出的 sha 时才还原。
import sys, os, json, hashlib, shutil, time, pwd

ROOT = os.environ.get("HS_ROOT", "")
P = lambda p: ROOT + p
H = "/home/ubuntu/.openclaw"
QQ = H + "/npm/projects/tencent-connect-openclaw-qqbot-a7ec020d86__openclaw-generation__g-b97d26bd0d7f19d9/node_modules/@tencent-connect/openclaw-qqbot/dist/index.cjs"
GATE = H + "/plugins/qq-group-followup-gate/index.js"
PARAMS = H + "/workspace/stickers/params.json"
AGENTS = H + "/workspace/AGENTS.md"
MANIFEST = H + "/patches/canonical-manifest.json"
BK = os.environ.get("HS_BK", "/root/hosino-backup-20261020-voice")
MARK = "HOSINO-VOICE-PARAMS v1"
FILES = [GATE, QQ, AGENTS, PARAMS]
sha = lambda b: hashlib.sha256(b).hexdigest()
fsha = lambda f: sha(open(P(f), "rb").read())

def rep(s, a, b, f):
    n = s.count(a)
    if n != 1: raise SystemExit(f"[{MARK}] 锚点缺失或不唯一 {f}: {a[:70]!r} count={n}")
    return s.replace(a, b)

# ======================= gate index.js =======================
G_HELPERS_ANCHOR = 'function hsSess(p, id) {'
G_HELPERS = r'''/* HOSINO-VOICE-PARAMS v1: voice section of stickers/params.json (code decides per turn) */
function hsDay(tz) { try { return new Intl.DateTimeFormat("en-CA", { timeZone: tz || "Asia/Singapore" }).format(new Date()); } catch { return ""; } }
function hsVoiceCfg(HP) {
  const v = HP && HP.voice; if (!v || typeof v !== "object") return null;
  const num = (x, d, lo, hi, int) => { let n = Number(x); if (!Number.isFinite(n)) return d; if (int) n = Math.floor(n); return Math.max(lo, Math.min(hi, n)); };
  const tz = typeof v.tz === "string" && v.tz ? v.tz : "Asia/Singapore";
  const qh = (Array.isArray(v.quietHours) ? v.quietHours : v.quietHours ? [v.quietHours] : []).filter((q) => q && q.start && q.end).map((q) => ({ start: q.start, end: q.end, tz: q.tz || tz }));
  return { enabled: v.enabled !== false, probability: num(v.probability, 0.12, 0, 1), cooldownReplies: num(v.cooldownReplies, 4, 0, 100, true),
    quietHours: qh, tz, perConversation: v.perConversation && typeof v.perConversation === "object" ? v.perConversation : {},
    defaultEnabled: !!v.defaultEnabled, maxChars: num(v.maxChars, 40, 1, 200, true), dailyLimit: num(v.dailyLimit, 20, 0, 1000, true),
    exclusiveWithSticker: v.exclusiveWithSticker !== false };
}
/* returns {hit, why, max}; why in off|session-off|quiet-hours|daily-limit|cooldown|roll-miss|hit */
function hsVoiceDecide(V, conv, g, rnd) {
  if (!V.enabled) return { hit: false, why: "off" };
  const pc = V.perConversation[conv]; const pco = pc && typeof pc === "object" ? pc : null;
  if (!(pco ? pco.enabled !== false : V.defaultEnabled)) return { hit: false, why: "session-off" };
  if (V.quietHours.some((q) => hsQuiet(q))) return { hit: false, why: "quiet-hours" };
  const today = hsDay(V.tz);
  if (V.dailyLimit > 0 && g && g.voiceDay === today && (Number(g.voiceDayCount) || 0) >= V.dailyLimit) return { hit: false, why: "daily-limit" };
  const vGap = g && g.lastVoiceReply != null ? (Number(g.replies) || 0) - g.lastVoiceReply : null;
  if (vGap != null && vGap < V.cooldownReplies) return { hit: false, why: "cooldown" };
  const p = pco && Number.isFinite(Number(pco.probability)) && pco.probability !== null ? Math.max(0, Math.min(1, Number(pco.probability))) : V.probability;
  return (rnd || Math.random)() < p ? { hit: true, why: "hit", max: V.maxChars } : { hit: false, why: "roll-miss" };
}
'''
G_VDEC_ANCHOR = '  const hsS = hsStk(cfg.stickerDir); const HP = hsS.params; let hsAttach = false;\n'
G_VDEC = G_VDEC_ANCHOR + '''  const hsV = hsVoiceCfg(HP); const hsVD = hsV ? hsVoiceDecide(hsV, "group:" + gid.toLowerCase(), g, mediaHint.rnd) : null; /* HOSINO-VOICE-PARAMS v1 */
  const hsVBlockSticker = !!(hsVD && hsVD.hit && hsV.exclusiveWithSticker);
  try { mediaHint.last = hsVD ? { voice: hsVD.why } : null; } catch {}
'''
G_STK_A = '    if (!on || hsQuiet(HP.quietHours) || !ok.length) parts.push("这轮不发表情包，不要写 && 标签");'
G_STK_B = '    if (hsVBlockSticker) parts.push("这轮不发表情包，不要写 && 标签"); /* HOSINO-VOICE-PARAMS v1: this turn is a voice turn */\n    else if (!on || hsQuiet(HP.quietHours) || !ok.length) parts.push("这轮不发表情包，不要写 && 标签");'
G_VOICE_A = '  if (cfg.voice !== false) {\n    if (vGap != null && vGap < Number(cfg.voiceCooldownReplies)) parts.push("刚发过语音，这轮不用语音");'
G_VOICE_B = '''  if (hsVD && cfg.voice !== false) { /* HOSINO-VOICE-PARAMS v1 */
    if (hsVD.hit) parts.push(`这一轮请发一句语音：把回复里最适合用声音说的一句（不超过 ${hsVD.max} 字，口语、带语气）写成 <语音>台词</语音>，只写一句，其余照常写文字；如果这轮保持沉默，或者内容是报错、隐私、长篇说明，就不带`);
    else parts.push("这轮不发语音，不要写 <语音> 标签");
  } else if (cfg.voice !== false) {
    if (vGap != null && vGap < Number(cfg.voiceCooldownReplies)) parts.push("刚发过语音，这轮不用语音");'''
G_RET_A = '  if (hsAttach) return `【表情/语音】'
G_RET_B = '  if (hsVD) return `【表情/语音】一条回复最多一个标记，表情包和语音不同时用。${parts.join("；")}。保持沉默时不要加；绝不提及或解释这些标记。`; /* HOSINO-VOICE-PARAMS v1 */\n' + G_RET_A

def patch_gate(s):
    if MARK in s: return s, False
    s = rep(s, G_HELPERS_ANCHOR, G_HELPERS + G_HELPERS_ANCHOR, GATE)
    s = rep(s, G_VDEC_ANCHOR, G_VDEC, GATE)
    s = rep(s, G_STK_A, G_STK_B, GATE)
    s = rep(s, G_VOICE_A, G_VOICE_B, GATE)
    s = rep(s, G_RET_A, G_RET_B, GATE)
    return s, True

# ======================= qqbot dist/index.cjs =======================
Q_HELP_ANCHOR = '/* HOSINO-STICKER-PATCH v1: auto-generate missing category in background (genEnabled/genDailyCap) */'
Q_HELP = r'''/* HOSINO-VOICE-PARAMS v1: send-time backstop for stickers/params.json voice section */
function __hsVoice(dir) { try { const v = __hsStk(dir).params?.voice; return v && typeof v === "object" ? v : null; } catch { return null; } }
function __hsVDay(tz) { try { return new Intl.DateTimeFormat("en-CA", { timeZone: tz || "Asia/Singapore" }).format(new Date()); } catch { return ""; } }
function __hsVoiceBlock(dir, gid, g) {
  const v = __hsVoice(dir); if (!v) return "";
  if (v.enabled === false) return "off";
  const pc = v.perConversation?.["group:" + String(gid).toLowerCase()];
  if (pc && typeof pc === "object" ? pc.enabled === false : !v.defaultEnabled) return "session-off";
  const tz = typeof v.tz === "string" && v.tz ? v.tz : "Asia/Singapore";
  const qh = Array.isArray(v.quietHours) ? v.quietHours : v.quietHours ? [v.quietHours] : [];
  if (qh.some((q) => q && __hsQuiet({ start: q.start, end: q.end, tz: q.tz || tz }))) return "quiet-hours";
  const lim = Math.floor(Number(v.dailyLimit ?? 20));
  if (lim > 0 && g && g.voiceDay === __hsVDay(tz) && (Number(g.voiceDayCount) || 0) >= lim) return "daily-limit";
  return "";
}
'''
Q_CFG_A = '} catch {} /* HOSINO-STICKER-PATCH v1 */\n  if (cfg.enabled === false) return null;'
Q_CFG_B = '} catch {} /* HOSINO-STICKER-PATCH v1 */\n  try { const hv = __hsVoice(cfg.stickerDir); if (hv) { const mc = Math.floor(Number(hv.maxChars)); if (Number.isFinite(mc)) cfg.voiceMaxChars = Math.max(1, Math.min(200, mc)); const cr = Math.floor(Number(hv.cooldownReplies)); if (Number.isFinite(cr)) cfg.voiceCooldownReplies = Math.max(0, Math.min(100, cr)); } } catch {} /* HOSINO-VOICE-PARAMS v1 */\n  if (cfg.enabled === false) return null;'
Q_CNT_A = '    if (flags.voice) { g.lastVoiceReply = g.replies; g.lastVoiceAt = Date.now(); }'
Q_CNT_B = '    if (flags.voice) { g.lastVoiceReply = g.replies; g.lastVoiceAt = Date.now(); try { const d = __hsVDay(__hsVoice(cfg.stickerDir)?.tz); if (g.voiceDay !== d) { g.voiceDay = d; g.voiceDayCount = 0; } g.voiceDayCount = (Number(g.voiceDayCount) || 0) + 1; } catch {} /* HOSINO-VOICE-PARAMS v1 */ }'
Q_PRE_A = '      if (!snapshot().voiceOk) return;\n'
Q_PRE_B = Q_PRE_A + '      if (__hsVoiceBlock(cfg.stickerDir, gid, __qqMtGroup(gid))) return; /* HOSINO-VOICE-PARAMS v1: no TTS prestart when params block it */\n'
Q_RSN_A = '        let reason = "";\n        if (!cfg.voice) reason = "disabled";'
Q_RSN_B = '        let reason = "";\n        const __hsVWhy = __hsVoiceBlock(cfg.stickerDir, gid, __qqMtGroup(gid)); /* HOSINO-VOICE-PARAMS v1 */\n        if (!cfg.voice) reason = "disabled";\n        else if (__hsVWhy) reason = `params ${__hsVWhy}`;'

def patch_qq(s):
    if MARK in s: return s, False
    s = rep(s, Q_HELP_ANCHOR, Q_HELP + Q_HELP_ANCHOR, QQ)
    s = rep(s, Q_CFG_A, Q_CFG_B, QQ)
    s = rep(s, Q_CNT_A, Q_CNT_B, QQ)
    s = rep(s, Q_PRE_A, Q_PRE_B, QQ)
    s = rep(s, Q_RSN_A, Q_RSN_B, QQ)
    return s, True

# ======================= AGENTS.md =======================
A1 = "- **群聊例外（2026-10-06）**：群聊里不掷概率、不跑语音脚本，统一用 `<语音>` 标签（见「QQ 群聊门控」）；下面的概率/极端情绪规则只用于私聊。"
A1b = "- **群聊（2026-10-20 起由代码决定，HOSINO-VOICE-PARAMS v1）**：群聊里发不发语音由插件按 `stickers/params.json` 的 voice 段决定（概率/冷却/静默时段/每日上限/会话开关）。提示说「这一轮请发一句语音」就把一句不超过 40 字的话写成 `<语音>台词</语音>`；提示说「这轮不发语音」就不要写。群聊不跑语音脚本。下面的情境/极端情绪规则只用于私聊。"
A2_START = "- **30% 概率触发 + 50 字上限"
A2b = "- **私聊语音（暂由模型判断，代码控制留到第二期）**：私聊没有代码掷概率，按上面的情境和下面的极端情绪自己判断，不要假装掷骰子；**语音台词不超过 40 字**，超过就改发文字。"
A3 = "  台词 ≤50 字，用单引号包住"
A3b = "  台词 ≤40 字，用单引号包住"
A4_OLD = "语气重要时（逗人、安慰、打招呼、卖萌）可以把一句 ≤30 字的短话写成 `<语音>台词</语音>`，会自动合成语音发出（最多 1 句）。两者都可不用，不要提及或解释标签；保持沉默时不要加。提示说「刚发过」就这轮别用，说「好久没发」就合适时带一个。代码会兜底：标签一律不会出现在群里，冷却（表情包隔 2 条回复、语音隔 3 条）、每条最多 1 图 1 语音、不连发同一张、语音过长改发文字"
A4_NEW = "发不发语音同样由代码决定（params.json 的 voice 段，HOSINO-VOICE-PARAMS v1）：提示说「这一轮请发一句语音」时，把一句不超过 40 字的话写成 `<语音>台词</语音>`，会自动合成语音发出（最多 1 句）；提示说「这轮不发语音」就不要写。表情包和语音不会同一轮都要求。不要提及或解释标签；保持沉默时不要加。代码会兜底：标签一律不会出现在群里，冷却、静默时段、每日上限、每条最多 1 个媒体、不连发同一张、语音过长改发文字"

def patch_agents(s):
    if MARK in s: return s, False
    s = rep(s, A1, A1b, AGENTS)
    i = s.find(A2_START)
    if i < 0 or s.count(A2_START) != 1: raise SystemExit("AGENTS 30% 段锚点缺失")
    j = s.index("\n", i); s = s[:i] + A2b + s[j:]
    s = rep(s, A3, A3b, AGENTS)
    s = rep(s, A4_OLD, A4_NEW, AGENTS)
    return s, True

# ======================= params.json =======================
VOICE_DEFAULT = {
    "enabled": True, "probability": 0.12, "cooldownReplies": 4,
    "tz": "Asia/Singapore", "quietHours": [{"start": "00:00", "end": "08:00"}],
    "defaultEnabled": False,
    "perConversation": {"group:b4ee2a7019c96343c96eeba8cb63d8c5": {"enabled": True}, "group:379363a480715dfc01f13aaf92571111": {"enabled": True}},
    "maxChars": 40, "dailyLimit": 20, "exclusiveWithSticker": True,
    "_note": "HOSINO-VOICE-PARAMS v1：只管群聊 <语音> 标签；私聊第二期。dailyLimit 按会话按天（Asia/Singapore）计，0=不限。"
}
def patch_params(s):
    j = json.loads(s)
    if "voice" in j: return s, False
    j["voice"] = VOICE_DEFAULT; j["updatedAt"] = int(time.time() * 1000)
    return json.dumps(j, ensure_ascii=False, indent=1), True

PATCHERS = {GATE: patch_gate, QQ: patch_qq, AGENTS: patch_agents, PARAMS: patch_params}

def write(f, s):
    st = os.stat(P(f)); tmp = P(f) + ".hsv-tmp"
    open(tmp, "w").write(s)
    try: os.chown(tmp, st.st_uid, st.st_gid)
    except PermissionError: pass
    os.chmod(tmp, st.st_mode & 0o7777); os.replace(tmp, P(f))

def backup_all():
    os.makedirs(BK, exist_ok=True)
    for f in FILES + [MANIFEST]:
        if not os.path.exists(P(f)): continue
        dst = BK + "/" + f.strip("/").replace("/", "__")
        if not os.path.exists(dst):
            shutil.copy2(P(f), dst)
            with open(BK + "/SHA256SUMS", "a") as o: o.write(f"{fsha(f)}  {f}\n")

def node_check(f, s):
    import subprocess, tempfile
    ext = ".cjs" if f.endswith(".cjs") else ".mjs"
    with tempfile.NamedTemporaryFile("w", suffix=ext, delete=False) as t: t.write(s)
    r = subprocess.run(["node", "--check", t.name], capture_output=True, text=True); os.unlink(t.name)
    if r.returncode: raise SystemExit(f"node --check 失败 {f}:\n{r.stderr[:800]}")

def check(do_apply):
    plan = {}
    for f in FILES:
        s = open(P(f)).read(); ns, ch = PATCHERS[f](s)
        if f.endswith((".js", ".cjs")) and ch: node_check(f, ns)
        plan[f] = (ns, ch)
        print(("将修改 " if ch else "已打过 ") + f, f"old={fsha(f)[:12]}", f"new={sha(ns.encode())[:12]}" if ch else "")
    if not do_apply: print("check OK（未写入）"); return
    backup_all(); out = {}
    for f, (ns, ch) in plan.items():
        if ch: write(f, ns)
        out[f] = fsha(f)
    json.dump(out, open(BK + "/APPLIED_SHA256.json", "w"), indent=1)
    print("apply 完成；备份在", BK)

def revert():
    ap = json.load(open(BK + "/APPLIED_SHA256.json"))
    for f, h in ap.items():
        b = BK + "/" + f.strip("/").replace("/", "__")
        if fsha(f) != h: print("跳过（补丁后又被改过，需人工处理）", f); continue
        st = os.stat(P(f)); shutil.copy2(b, P(f) + ".hsv-tmp")
        try: os.chown(P(f) + ".hsv-tmp", st.st_uid, st.st_gid)
        except PermissionError: pass
        os.replace(P(f) + ".hsv-tmp", P(f)); print("已还原", f)
    print("如已登记 manifest，请再跑 --unregister-manifest")

def register():
    mf = P(MANIFEST); m = json.load(open(mf))
    resdir = "resources/hosino-20261020-voice"; os.makedirs(os.path.dirname(mf) + "/" + resdir, exist_ok=True)
    shutil.copy2(mf, BK + "/canonical-manifest.json.pre-voice") if not os.path.exists(BK + "/canonical-manifest.json.pre-voice") else None
    n = 0
    for i, e in enumerate(m["files"]):
        if e.get("target") in (GATE, QQ, AGENTS):
            cur = fsha(e["target"])
            if cur == e["sha256"]: continue
            snap = f"{resdir}/snapshot-{n}"; sp = os.path.dirname(mf) + "/" + snap; shutil.copy2(P(e["target"]), sp); n += 1
            try: ms = os.stat(mf); os.chown(sp, ms.st_uid, ms.st_gid); os.chown(os.path.dirname(sp), ms.st_uid, ms.st_gid); os.chmod(sp, 0o600)
            except PermissionError: pass
            rb = e.setdefault("recognizedBefore", [])
            if e["sha256"] not in rb: rb.append(e["sha256"])
            e["sha256"] = cur; e["snapshot"] = snap
            print("登记", e["target"], cur[:12])
    if not any(r.get("label") == MARK for r in m["markerRegistry"]):
        m["markerRegistry"].append({"label": MARK, "targets": [GATE, QQ, AGENTS], "marker": MARK})
    t = mf + ".hsv-tmp"; json.dump(m, open(t, "w"), ensure_ascii=False, indent=1)
    st = os.stat(mf)
    try: os.chown(t, st.st_uid, st.st_gid)
    except PermissionError: pass
    os.chmod(t, st.st_mode & 0o7777); os.replace(t, mf)
    print("manifest 已更新；请跑 reapply_all.sh --check 确认 0 差异")

def unregister():
    b = BK + "/canonical-manifest.json.pre-voice"; shutil.copy2(b, P(MANIFEST)); print("manifest 已还原为补丁前版本")

a = sys.argv[1:]
if "--apply" in a: check(True)
elif "--revert" in a: revert()
elif "--register-manifest" in a: register()
elif "--unregister-manifest" in a: unregister()
else: check(False)
