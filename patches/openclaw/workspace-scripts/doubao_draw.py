#!/usr/bin/env python3
"""豆包生图脚本 - 调用火山引擎 Ark doubao-seedream 生图
用法: python3 doubao_draw.py "<提示词>" [输出路径] [尺寸]
"""
import json, sys, os, urllib.request, time
import media_deadline as _media

API_KEY = os.environ.get("ARK_API_KEY", "").strip()  # 改写：原先硬编码，发布版改为读环境变量
API_URL = "https://ark.cn-beijing.volces.com/api/v3/images/generations"
# 默认用免费资源包模型（2026-08-30 __HS_OWNER_NAME__定：省钱优先）
MODEL = "doubao-seedream-4-5-251128"
DATA_COLLAB_MODEL = "doubao-seedream-5-0-pro-260628"
# 可选: doubao-seedream-4-0-250828 / doubao-seedream-4-5-251128
#       doubao-seedream-5-0-lite-260128 / doubao-seedream-5-0-pro-260628
# 5.0 Pro data-collaboration 仅按需通过第 4 个命令行参数指定，不改变日常默认模型。

def draw(prompt, size="2048x2048", out_path=None, model=None, _budget=None):
    if not API_KEY: sys.exit("缺少环境变量 ARK_API_KEY")
    _budget = _media.Deadline(600.0) if _budget is None else _budget
    if model:
        MODEL = model
    else:
        MODEL = globals()['MODEL']
    payload = {
        "model": MODEL,
        "prompt": prompt,
        "size": size,
        "response_format": "url",
        "watermark": False,
    }
    req = urllib.request.Request(API_URL, data=json.dumps(payload).encode(),
                                 headers={"Authorization": f"Bearer {API_KEY}",
                                          "Content-Type": "application/json"})
    t0 = time.time()
    try:
        resp = _budget.read_json(req, 180.0)
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", errors="replace")
        sys.exit(f"Ark HTTP {e.code}（model={MODEL}）: {detail[:1000]}")
    except urllib.error.URLError as e:
        sys.exit(f"Ark 网络错误（model={MODEL}）: {e.reason}")
    data = resp.get("data", [])
    if not data:
        sys.exit(f"无返回数据: {json.dumps(resp, ensure_ascii=False)[:500]}")
    img_url = data[0].get("url")
    if not img_url:
        sys.exit(f"无图片URL: {json.dumps(resp, ensure_ascii=False)[:500]}")
    # 下载图片
    req2 = urllib.request.Request(img_url, headers={"User-Agent": "Mozilla/5.0"})
    if not out_path:
        workspace = os.environ.get("OPENCLAW_WORKSPACE", "__HS_OPENCLAW_HOME__/workspace")
        out_path = os.path.join(workspace, "media", f"draw_{int(t0)}.png")
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    image_size = _budget.download(req2, out_path, 60.0, max_bytes=64 * 1024 * 1024)
    print(f"OK {time.time()-t0:.1f}s -> {out_path} ({image_size} bytes)")

if __name__ == "__main__":
    prompt = sys.argv[1] if len(sys.argv) > 1 else "可爱猫娘"
    out = sys.argv[2] if len(sys.argv) > 2 else None
    size = sys.argv[3] if len(sys.argv) > 3 else "2048x2048"
    model = sys.argv[4] if len(sys.argv) > 4 else None
    draw(prompt, size, out, model)
