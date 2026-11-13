#!/usr/bin/env python3
"""把补丁/插件里的 __HS_XXX__ 占位符 换成你自己的值（只改你指定的文件，原地写，先自动备份为 *.pre-configure）。

用法:
  python3 configure.py --ids my-ids.json --check  <文件或目录>...   # 只列出还没替换的占位符
  python3 configure.py --ids my-ids.json          <文件或目录>...   # 替换

my-ids.json 见 ids.example.json。没填的键会用默认值：
  OPENCLAW_HOME=~/.openclaw，USER_HOME=~，OPENCLAW_PKG=$(npm root -g)/openclaw，
  名字类默认“主人”等，QQ openid 类默认空字符串（对应功能不生效，不会报错）。
"""
import argparse, json, os, re, shutil, subprocess, sys

PH = re.compile(r"__HS_([A-Z0-9_]+?)__")

def defaults():
    home = os.path.expanduser("~")
    try:
        root = subprocess.run(["npm", "root", "-g"], capture_output=True, text=True, timeout=20).stdout.strip()
    except Exception:
        root = ""
    return {
        "OPENCLAW_HOME": os.path.join(home, ".openclaw"), "USER_HOME": home,
        "OPENCLAW_PKG": os.path.join(root, "openclaw") if root else "",
        "GATEWAY_CERT_IP": "127.0.0.1", "GROUP_NEW_SESSION_ID": "", "GROUP_OLD_SESSION_ID": "", "OWNER_NAME": "主人", "BOT_NAME": "星野", "OWNER_OPENID": "",
        "GROUP_NEW_OPENID": "", "GROUP_OLD_OPENID": "", "GROUP_IDENTITY_TABLE": "",
        "MEMBER1_OPENID": "", "MEMBER1_NAME": "群友A", "MEMBER1_ALIAS": "群友A",
        "MEMBER2_OPENID": "", "MEMBER2_NAME": "群友B",
        "OTHER_BOT_OPENID": "", "OTHER_BOT_NAME": "另一个机器人",
    }

def files(paths):
    for p in paths:
        if os.path.isdir(p):
            for d, _, fs in os.walk(p):
                for f in fs:
                    if not f.endswith(".pre-configure"): yield os.path.join(d, f)
        else:
            yield p

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ids", required=True); ap.add_argument("--check", action="store_true")
    ap.add_argument("--no-backup", action="store_true"); ap.add_argument("paths", nargs="+")
    a = ap.parse_args()
    v = defaults(); v.update({k: val for k, val in json.load(open(a.ids, encoding="utf-8")).items() if not k.startswith("_")})
    missing = [k for k in ("OPENCLAW_HOME", "OPENCLAW_PKG", "USER_HOME") if not v.get(k)]
    if missing: sys.exit("缺少路径值: " + ", ".join(missing))
    changed = 0
    for f in files(a.paths):
        try: s = open(f, encoding="utf-8", errors="surrogateescape", newline="").read()
        except (IsADirectoryError, PermissionError): continue
        found = set(PH.findall(s))
        if not found: continue
        unknown = sorted(found - set(v))
        if a.check:
            print(f"{f}: {sorted(found)}" + (f"  未知: {unknown}" if unknown else "")); continue
        if unknown: sys.exit(f"{f} 有未知占位符 {unknown}，停止")
        t = PH.sub(lambda m: v[m.group(1)], s)
        if not a.no_backup and not os.path.exists(f + ".pre-configure"): shutil.copy2(f, f + ".pre-configure")
        st = os.stat(f); tmp = f + ".cfg-tmp"
        open(tmp, "w", encoding="utf-8", errors="surrogateescape", newline="").write(t)
        os.chmod(tmp, st.st_mode & 0o7777); os.replace(tmp, f); changed += 1; print("configured", f)
    if not a.check: print(f"完成，改了 {changed} 个文件")

if __name__ == "__main__": main()
