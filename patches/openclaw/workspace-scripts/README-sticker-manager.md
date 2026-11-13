# sticker_manager.py — 表情包脚本帮助

表情包库管理器。发表情包前先按名称在库里查找；命中直接用，未命中则生图、按命名规则
存入库后返回。库目录：`stickers/`。

## 依赖

- Python 3，脚本会自动切到 workspace 的 `.venv`（含 Pillow）。
- 豆包后端：`scripts/doubao_draw.py`（火山方舟 Ark）。
- 其他后端：`openclaw infer image generate`（需对应 provider 已配置）。

## 命名规则

- 自动生成：`<情绪或动作>-<生图模型>.png|.jpg|.gif`
- 手动入库：`<情绪或动作>-手动入库.png|.jpg|.gif`
- `<情绪或动作>` 用于查找匹配：完全相等 > 前缀 > 包含。

## 命令

```
./scripts/sticker_manager.py get  "<情绪或动作>" [提示词] [--model M]
./scripts/sticker_manager.py find "<情绪或动作>"
./scripts/sticker_manager.py add  "<情绪或动作>" <图片路径>
./scripts/sticker_manager.py list ["<关键词>"]
./scripts/sticker_manager.py prompt "<情绪或动作>"
./scripts/sticker_manager.py models
```

- `get`：查库；没有就用模型生图并保存。`--model` 指定生图模型（不填用默认）。
- `find`：只查，不生成。命中退出码 0，未命中 1。
- `add`：把网图/本地图按 `-手动入库` 规则拷进库。
- `list`：列库内容，可带关键词过滤。
- `prompt`：只打印默认生图提示词。
- `models`：列出已注册生图模型及其计算出的 1:1 尺寸。

所有命令输出 JSON（`status` 字段标识成功/失败）。

## 生图后端与模型

模型写在 `scripts/sticker_models.json`，可随时加新模型：

```json
{
  "default": "doubao/doubao-seedream-4-5-251128",
  "floor_side": 960,
  "models": {
    "doubao/doubao-seedream-4-5-251128": { "provider": "doubao", "min_pixels": 3686400 },
    "openai/gpt-image-2": { "provider": "openclaw", "min_side": 1024, "square_sizes": ["1024x1024", "2048x2048"] }
  }
}
```

- `provider: doubao` → 走火山方舟 Ark。
- `provider: openclaw` → 走 `openclaw infer image generate`。
- `provider` 留空则按 ref 前缀判断。

## 分辨率规则（1:1）

1. 目标边长 = `max(floor_side, 模型最小边长)`
2. 模型最小边长：有 `min_side` 用 `min_side`，否则由 `min_pixels` 换算 `ceil(sqrt(min_pixels))`
3. 目标边长不在该模型可选正方形尺寸里时，向上取最近的可选尺寸
4. `floor_side` 默认 960：1:1 边长不低于 960（像素量 ≈ 720p 的 1280×720）
5. 生成后居中裁剪为正方形；不足 `floor_side` 则本地放大

> 例：豆包 seedream 要求 ≥3,686,400 像素 → sqrt≈1920，所以用 1920×1920。
> OpenAI gpt-image-2 请求 1024×1024，实际回传可能为 1254×1254，脚本会裁正后入库。

## 环境变量

- `OPENCLAW_WORKSPACE`：workspace 根（默认 `__HS_OPENCLAW_HOME__/workspace`）。
- `STICKER_GEN_TIMEOUT`：`openclaw infer` 调用超时秒数（默认 240）。

## 备注

- OpenAI 后端偶发 `UND_ERR_SOCKET` 网络瞬断，重跑一次即可。
