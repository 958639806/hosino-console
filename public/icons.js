/**
 * 星野·线标 — hosino-console 图标审美草稿（2026-11-17）
 *
 * 原创圆角线性路径，24×24 网格，线宽 1.8，currentColor。
 * 不使用 CDN，不引用未保存许可证的第三方图标包。
 * 品牌标识 public/icon.svg 不在本表，不在此替换。
 */

export const ICON_VIEWBOX = "0 0 24 24";
export const ICON_STROKE = 1.8;

const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
}[c]));

const f = d => `<path class="hs-fill" d="${d}"/>`;

const FILE_BODY = '<path d="M13.5 3.5H7A1.6 1.6 0 0 0 5.4 5.1v13.8A1.6 1.6 0 0 0 7 20.5h10a1.6 1.6 0 0 0 1.6-1.6V8.4z"/><path d="M13.5 3.5V8.4h4.9"/>';

/** 语义图标路径。键稳定，供 ic(name) 使用。 */
export const ICONS = {
  home: `${f("M5 10.8 12 4.6l7 6.2V19a1.6 1.6 0 0 1-1.6 1.6H6.6A1.6 1.6 0 0 1 5 19z")}<path d="M4.2 11.3 12 4.2l7.8 7.1"/><path d="M6.5 10.6V19a1.3 1.3 0 0 0 1.3 1.3h8.4A1.3 1.3 0 0 0 17.5 19v-8.4"/><path d="M10.4 20.3v-4.3h3.2v4.3"/>`,
  chat: `${f("M5.2 17.8 4 20.2a.8.8 0 0 1-1.2-.72V9.2A3.4 3.4 0 0 1 6.2 5.8h11.6A3.4 3.4 0 0 1 21.2 9.2v6.2a3.4 3.4 0 0 1-3.4 3.4H8.1z")}<path d="M19.8 11.6A7.8 7.8 0 0 1 9.2 18.7L4.2 20.1l1.2-4.5A7.8 7.8 0 1 1 19.8 11.6z"/>`,
  term: `${f("M3.5 4.5h17a2.3 2.3 0 0 1 2.3 2.3v10.4a2.3 2.3 0 0 1-2.3 2.3h-17A2.3 2.3 0 0 1 1.2 17.2V6.8A2.3 2.3 0 0 1 3.5 4.5z")}<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><path d="m7.5 9.2 3.2 2.8-3.2 2.8M12.4 14.8h4.2"/>`,
  model: `${f("M12 3.2 20 7.6v8.8L12 20.8 4 16.4V7.6z")}<path d="M12 3.2 20 7.6v8.8L12 20.8 4 16.4V7.6z"/><path d="M4 7.6 12 12l8-4.4M12 12v8.8"/>`,
  logs: `<path d="M8.4 6.5h11.2M8.4 12h11.2M8.4 17.5h7.6"/><circle cx="5.2" cy="6.5" r="1.05" fill="currentColor" stroke="none"/><circle cx="5.2" cy="12" r="1.05" fill="currentColor" stroke="none"/><circle cx="5.2" cy="17.5" r="1.05" fill="currentColor" stroke="none"/>`,
  more: `<circle cx="6" cy="12" r="1.7" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.7" fill="currentColor" stroke="none"/><circle cx="18" cy="12" r="1.7" fill="currentColor" stroke="none"/>`,
  people: `<circle cx="9" cy="7.6" r="3.05"/><path d="M3.6 19.7a6.15 6.15 0 0 1 10.8 0"/><path d="M16.3 8.4a2.7 2.7 0 1 1 0 5.1"/><path d="M17.6 14.8a5.2 5.2 0 0 1 3.5 4.9"/>`,
  group: `<circle cx="8.3" cy="8" r="2.85"/><circle cx="15.6" cy="8.5" r="2.45"/><path d="M3.2 19.6a5.8 5.8 0 0 1 10.2 0"/><path d="M12.4 19.6a5.3 5.3 0 0 1 8.4 0"/>`,
  smile: `${f("M12 3.8a8.2 8.2 0 1 1 0 16.4 8.2 8.2 0 0 1 0-16.4z")}<circle cx="12" cy="12" r="8.2"/><path d="M8.4 13.7a4.2 4.2 0 0 0 7.2 0"/><circle cx="9" cy="10" r="1.05" fill="currentColor" stroke="none"/><circle cx="15" cy="10" r="1.05" fill="currentColor" stroke="none"/>`,
  voice: `<rect x="9.15" y="3.7" width="5.7" height="9.3" rx="2.85"/><path d="M6.5 11.8a5.5 5.5 0 0 0 11 0"/><path d="M12 17.3v2.9M9.1 20.2h5.8"/>`,
  brain: `<path d="M9.4 4.6a3.15 3.15 0 0 0-3.5 3.5 3 3 0 0 0-1.6 3.1 3.15 3.15 0 0 0 2.2 3.4 3 3 0 0 0 2.9 2.5h.8V5.2A2.1 2.1 0 0 0 9.4 4.6z"/><path d="M14.6 4.6a3.15 3.15 0 0 1 3.5 3.5 3 3 0 0 1 1.6 3.1 3.15 3.15 0 0 1-2.2 3.4 3 3 0 0 1-2.9 2.5H14V5.2A2.1 2.1 0 0 1 14.6 4.6z"/><path d="M12 5.4v11.8"/>`,
  plug: `<path d="M9 3.4v4.2M15 3.4v4.2"/><path d="M7 7.6h10v3.5a5 5 0 0 1-10 0z"/><path d="M12 16.1v4.5"/>`,
  gear: `<circle cx="12" cy="12" r="3"/><path d="M10.66 6.00 L10.51 2.97 L13.49 2.97 L13.34 6.00 L16.53 7.84 L19.07 6.19 L20.56 8.78 L17.87 10.16 L17.87 13.84 L20.56 15.22 L19.07 17.81 L16.53 16.16 L13.34 18.00 L13.49 21.03 L10.51 21.03 L10.66 18.00 L7.47 16.16 L4.93 17.81 L3.44 15.22 L6.13 13.84 L6.13 10.16 L3.44 8.78 L4.93 6.19 L7.47 7.84 Z"/>`,
  clock: `<circle cx="12" cy="12" r="8.2"/><path d="M12 7.2v5.1l3.4 2"/>`,
  channel: `<path d="M4.8 12.2a7.2 7.2 0 0 1 14.4 0"/><path d="M7.6 12.2a4.4 4.4 0 0 1 8.8 0"/><circle cx="12" cy="13.3" r="1.45"/><path d="M12 14.8v5.2"/>`,
  shield: `${f("M12 3.2 4.6 6.2v5.7c0 4.6 3.2 7.4 7.4 8.5 4.2-1.1 7.4-3.9 7.4-8.5V6.2z")}<path d="M12 3.2 4.6 6.2v5.7c0 4.6 3.2 7.4 7.4 8.5 4.2-1.1 7.4-3.9 7.4-8.5V6.2z"/><path d="m8.6 12.2 2.3 2.3 4.6-4.6"/>`,
  wrench: `<circle cx="16.5" cy="7.5" r="3.3"/><path d="M14.1 9.9 6.5 17.5"/><circle cx="5.8" cy="18.2" r="1.65"/>`,
  file: `${FILE_BODY}<path d="M8.4 13h7.2M8.4 16.2h4.8"/>`,
  pulse: `<path d="M3.2 12.5h3.3l2.5-6.8 3.8 13.6 2.6-6.8h5.4"/>`,
  digest: `<path d="M5 5.2h11.4A1.8 1.8 0 0 1 18.2 7v12.3H6.6A1.6 1.6 0 0 1 5 17.7z"/><path d="M5 5.2v12.5"/><path d="M8.3 8.5h6.5M8.3 11.7h6.5M8.3 14.9h4.2"/>`,
  book: `<path d="M5 5.2A2 2 0 0 1 7 3.4h11.5v15.5H7A2 2 0 0 0 5 20.7z"/><path d="M5 5.2v15.5M9 6.8h6.4"/>`,
  bolt: `<path d="M12.7 3.2 5.5 13.3h6.2l-1.2 7.5 7.2-10.1h-6.2z"/>`,
  flame: `<path d="M12 3.4c1.1 3.2 4.8 5.3 4.8 9.2a4.8 4.8 0 0 1-9.6 0c0-2.3 1.3-3.8 2.3-4.8.4 1.5 1.1 2.5 2.1 2.9-.1-2.7 0-5.1.4-7.3z"/><path d="M12 16.8c-1.4 0-2.3-1-2.3-2.3"/>`,
  back: `<path d="M14.5 5.5 8 12l6.5 6.5"/>`,
  chev: `<path d="M9.5 5.5 16 12l-6.5 6.5"/>`,
  up: `<path d="m6 14.5 6-6 6 6"/>`,
  plus: `<path d="M12 5.5v13M5.5 12h13"/>`,
  search: `<circle cx="11" cy="11" r="6.4"/><path d="m16.2 16.2 4.1 4.1"/>`,
  sun: `<circle cx="12" cy="12" r="3.5"/><path d="M12 3.2v2.2M12 18.6v2.2M4.93 4.93l1.56 1.56M17.51 17.51l1.56 1.56M3.2 12h2.2M18.6 12h2.2M4.93 19.07l1.56-1.56M17.51 6.49l1.56-1.56"/>`,
  moon: `<path d="M20.2 13.1A8.2 8.2 0 1 1 10.9 3.8 6.4 6.4 0 0 0 20.2 13.1z"/>`,
  out: `<path d="M14 4.5h4.2A1.8 1.8 0 0 1 20 6.3v11.4a1.8 1.8 0 0 1-1.8 1.8H14"/><path d="m10 16.2 4.4-4.2L10 7.8"/><path d="M14.4 12H4"/>`,
  trash: `<path d="M5 7.2h14"/><path d="M9.6 11v5.4M14.4 11v5.4"/><path d="M7.1 7.2 7.9 18.2A1.6 1.6 0 0 0 9.5 19.7h5a1.6 1.6 0 0 0 1.6-1.5l.8-11"/><path d="M9.3 7.2V5.3a1 1 0 0 1 1-1h3.4a1 1 0 0 1 1 1v1.9"/>`,
  refresh: `<path d="M20.2 12a8.2 8.2 0 1 1-2.5-5.9"/><path d="M20.2 4.5v5.3h-5.3"/>`,
  tune: `<path d="M4.2 7h8.4M16.8 7h3"/><circle cx="14.6" cy="7" r="1.85"/><path d="M4.2 12h3.2M11.6 12h8.2"/><circle cx="9.4" cy="12" r="1.85"/><path d="M4.2 17h10.4M18.8 17h1"/><circle cx="16.6" cy="17" r="1.85"/>`,
  send: `<path d="M20.8 4.2 3.5 10.9l7.5 2 2 7.5z"/><path d="M10.9 12.9 20.8 4.2"/>`,
  play: `<path fill="currentColor" stroke="none" d="M8.1 5.7a1.2 1.2 0 0 1 1.84-1.02l9.3 5.76a1.2 1.2 0 0 1 0 2.12l-9.3 5.76A1.2 1.2 0 0 1 8.1 17.3z"/>`,
  stop: `<rect x="6.2" y="6.2" width="11.6" height="11.6" rx="2.4" fill="currentColor" stroke="none"/>`,
  pencil: `<path d="m13.5 5.1 5.4 5.4L8.6 20.8H3.2v-5.4z"/><path d="M12.1 6.5 17.4 11.8"/>`,
  download: `<path d="M12 4.2v11.2M7.6 11.2 12 15.6l4.4-4.4"/><path d="M5 19.8h14"/>`,
  clip: `<path d="M8.6 11.1v6.1a3.5 3.5 0 0 0 7 0V8.3a2.4 2.4 0 1 0-4.8 0v8.6a1.2 1.2 0 1 0 2.4 0V9.6"/>`,
  image: `<rect x="3.6" y="5.2" width="16.8" height="13.6" rx="2.2"/><circle cx="9" cy="10.1" r="1.45"/><path d="m4 16.8 4.3-4.1 3.1 2.9 3.4-3.5 5 4.7"/>`,
  quote: `<path fill="currentColor" stroke="none" d="M5.6 8.6h4.4v4.3c0 2.3-1.5 3.8-4.4 4.6v-2.1c1.5-.5 2.2-1.3 2.2-2.5H5.6z"/><path fill="currentColor" stroke="none" d="M14 8.6h4.4v4.3c0 2.3-1.5 3.8-4.4 4.6v-2.1c1.5-.5 2.2-1.3 2.2-2.5H14z"/>`,
  pin: `<path d="M12 14.6v6.6"/><path d="M8.2 3.8h7.6v1.6L14.4 9a3.2 3.2 0 1 1-4.8 0L8.2 5.4z"/>`,
  check: `<path d="m5.2 12.2 4.6 4.6 9-9.4"/>`,
  close: `<path d="M6.2 6.2 17.8 17.8M17.8 6.2 6.2 17.8"/>`,
  checkCircle: `<circle cx="12" cy="12" r="8.2"/><path d="m8 12.2 2.7 2.7 5.4-5.6"/>`,
  closeCircle: `<circle cx="12" cy="12" r="8.2"/><path d="M9.1 9.1 14.9 14.9M14.9 9.1 9.1 14.9"/>`,
  warn: `<path d="M12 4.8 20.4 19.4H3.6z"/><path d="M12 10v4.2"/><circle cx="12" cy="16.85" r=".9" fill="currentColor" stroke="none"/>`,
  lock: `<rect x="5.4" y="10.8" width="13.2" height="9.2" rx="2.1"/><path d="M8.3 10.8V7.6a3.7 3.7 0 0 1 7.4 0v3.2"/>`,
  ban: `<circle cx="12" cy="12" r="8.2"/><path d="M6.4 17.6 17.6 6.4"/>`,
  bell: `<path d="M7.2 10.4a4.8 4.8 0 0 1 9.6 0c0 4 1.1 5.2 1.1 5.2H6.1S7.2 14.4 7.2 10.4z"/><path d="M10.3 17.8a1.7 1.7 0 0 0 3.4 0"/>`,
  sleep: `<path d="M8.2 9.2h5.2L8.2 14.6h5.2"/><path d="M14.8 5.4h3.6l-3.6 3.6h3.6"/>`,
  paw: `<ellipse cx="12" cy="15.4" rx="4.3" ry="3.5" fill="currentColor" stroke="none"/><circle cx="6.35" cy="9.15" r="1.85" fill="currentColor" stroke="none"/><circle cx="9.95" cy="6.45" r="1.85" fill="currentColor" stroke="none"/><circle cx="14.05" cy="6.45" r="1.85" fill="currentColor" stroke="none"/><circle cx="17.65" cy="9.15" r="1.85" fill="currentColor" stroke="none"/>`,
  sparkle: `<path d="M12 3.2 13.6 9.2 19.8 10.4 13.6 11.6 12 17.6 10.4 11.6 4.2 10.4 10.4 9.2z"/><path d="M18.4 15.2v3.8M16.5 17.1h3.8"/>`,
  sad: `<circle cx="12" cy="12" r="8.2"/><path d="M8.6 16.2a4.2 4.2 0 0 1 6.8 0"/><circle cx="9" cy="10" r="1.05" fill="currentColor" stroke="none"/><circle cx="15" cy="10" r="1.05" fill="currentColor" stroke="none"/>`,
  heart: `<path d="M12 18.8S5.5 14.5 4.2 10.3A3.9 3.9 0 0 1 12 8.3a3.9 3.9 0 0 1 7.8 2C18.5 14.5 12 18.8 12 18.8z"/>`,
  user: `<circle cx="12" cy="8" r="3.15"/><path d="M5.2 19.5a6.8 6.8 0 0 1 13.6 0"/>`,
  statusOn: `<circle cx="12" cy="12" r="8.2"/><path d="m8 12.2 2.7 2.7 5.4-5.6"/>`,
  statusOff: `<circle cx="12" cy="12" r="8.2"/><path d="M8 12h8"/>`,
  statusWait: `<circle cx="12" cy="12" r="8.2"/><path d="M12 8v4.3l3 1.8"/>`,
  filePdf: `${FILE_BODY}<path d="M8.3 16.8v-4.4h2.2a1.4 1.4 0 0 1 0 2.8H8.3"/>`,
  fileZip: `${FILE_BODY}<path d="M12 8.8v8.2"/><path d="M10.6 10.4h2.8M10.6 12.4h2.8M10.6 14.4h2.8M10.6 16.4h2.8"/>`,
  fileAudio: `${FILE_BODY}<path d="M10.2 16.8V12l5-1v3.2"/><circle cx="9.3" cy="16.8" r="1.4"/><circle cx="13.8" cy="14.2" r="1.4"/>`,
  fileVideo: `${FILE_BODY}<rect x="8.2" y="12.2" width="5.2" height="4.4" rx="0.8"/><path d="m13.4 13.4 2.6-1v4.2l-2.6-1z"/>`,
  fileDoc: `${FILE_BODY}<path d="M8.4 12.6h7.2M8.4 15h7.2M8.4 17.4h4.6"/>`,
  fileSheet: `${FILE_BODY}<path d="M8.2 12.2h7.6v6.2H8.2z"/><path d="M8.2 14.4h7.6M8.2 16.4h7.6M11 12.2v6.2"/>`,
  fileText: `${FILE_BODY}<path d="M8.4 12.6h7.2M8.4 15h7.2M8.4 17.4h4.6"/>`,
  fileImage: `${FILE_BODY}<circle cx="9.4" cy="13.2" r="1.1"/><path d="m8 18.8 2.4-2.4 1.7 1.5 2.2-2.2 2.5 3.1"/>`
};

export const ALIASES = {
  newspaper: "digest",
  paperclip: "clip",
  x: "close",
  edit: "pencil",
  mic: "voice",
  dots: "more",
  overflow: "more",
  chevron: "chev"
};

/** 旧库里必须继续存在的键（含 ROUTES / V3T / ic() 字面量）。 */
export const LEGACY_KEYS = [
  "flame", "term", "digest", "book", "people", "smile", "bolt", "home", "chat",
  "model", "channel", "plug", "clock", "logs", "brain", "gear", "back", "chev",
  "more", "sun", "moon", "out", "send", "stop", "tune", "search", "shield",
  "wrench", "file", "pulse", "plus", "up", "play", "trash", "refresh"
];

export const ICON_META = {
  home: { group: "nav", label: "概览" },
  chat: { group: "nav", label: "会话" },
  term: { group: "nav", label: "原生 CLI" },
  model: { group: "nav", label: "模型与用量" },
  logs: { group: "nav", label: "日志" },
  more: { group: "nav", label: "更多" },
  people: { group: "nav", label: "性格" },
  voice: { group: "nav", label: "语音" },
  smile: { group: "nav", label: "表情" },
  brain: { group: "nav", label: "记忆" },
  group: { group: "nav", label: "群" },
  plug: { group: "nav", label: "能力与任务" },
  gear: { group: "nav", label: "系统与权限" },
  channel: { group: "nav", label: "渠道" },
  clock: { group: "nav", label: "定时任务" },
  shield: { group: "nav", label: "审批与配对" },
  wrench: { group: "nav", label: "工具与扩展" },
  digest: { group: "nav", label: "群报" },
  flame: { group: "nav", label: "小脾气" },
  bolt: { group: "nav", label: "主动行为" },
  file: { group: "file", label: "人设文件" },
  pulse: { group: "nav", label: "审计与诊断" },
  book: { group: "nav", label: "手册" },
  back: { group: "action", label: "返回" },
  chev: { group: "action", label: "进入" },
  up: { group: "action", label: "向上" },
  plus: { group: "action", label: "添加" },
  search: { group: "action", label: "搜索" },
  sun: { group: "action", label: "浅色" },
  moon: { group: "action", label: "深色" },
  out: { group: "action", label: "退出登录" },
  trash: { group: "action", label: "删除" },
  refresh: { group: "action", label: "刷新" },
  tune: { group: "action", label: "模型和思考" },
  send: { group: "action", label: "发送" },
  play: { group: "action", label: "播放 / 开始" },
  stop: { group: "action", label: "中止" },
  pencil: { group: "action", label: "改名" },
  download: { group: "action", label: "下载" },
  clip: { group: "action", label: "附件" },
  image: { group: "action", label: "图片" },
  quote: { group: "action", label: "引用" },
  pin: { group: "action", label: "置顶" },
  check: { group: "status", label: "完成" },
  close: { group: "status", label: "关闭 / 失败" },
  checkCircle: { group: "status", label: "成功" },
  closeCircle: { group: "status", label: "失败" },
  warn: { group: "status", label: "警告" },
  lock: { group: "status", label: "受保护" },
  ban: { group: "status", label: "禁止" },
  bell: { group: "status", label: "通知" },
  sleep: { group: "status", label: "保活 / 安静" },
  paw: { group: "status", label: "还没有内容" },
  sparkle: { group: "status", label: "问候点缀" },
  sad: { group: "status", label: "出错空状态" },
  heart: { group: "status", label: "定时心跳" },
  user: { group: "status", label: "发言人" },
  statusOn: { group: "status", label: "已生效" },
  statusOff: { group: "status", label: "没生效" },
  statusWait: { group: "status", label: "攒记录中" },
  filePdf: { group: "file", label: "PDF" },
  fileZip: { group: "file", label: "压缩包" },
  fileAudio: { group: "file", label: "音频" },
  fileVideo: { group: "file", label: "视频" },
  fileDoc: { group: "file", label: "文档" },
  fileSheet: { group: "file", label: "表格" },
  fileText: { group: "file", label: "文本" },
  fileImage: { group: "file", label: "图片文件" }
};

export const GROUPS = [
  { id: "nav", title: "导航" },
  { id: "action", title: "操作" },
  { id: "status", title: "状态" },
  { id: "file", title: "文件类型" }
];

export function resolveName(name) {
  return ALIASES[name] || name;
}

export function ic(name, opts = {}) {
  const key = resolveName(name);
  const body = ICONS[key];
  const classes = ["hs-icon", `hs-icon--${key}`];
  if (opts.class) classes.push(opts.class);
  const aria = opts.label
    ? `role="img" aria-label="${esc(opts.label)}"`
    : `aria-hidden="true"`;
  if (!body) {
    return `<svg class="${classes.join(" ")} hs-icon--missing" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${ICON_STROKE}" stroke-linecap="round" stroke-linejoin="round" data-icon="${esc(name)}" ${aria}><rect x="4" y="4" width="16" height="16" rx="3" stroke-dasharray="2 2"/></svg>`;
  }
  return `<svg class="${classes.join(" ")}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${ICON_STROKE}" stroke-linecap="round" stroke-linejoin="round" data-icon="${esc(key)}" ${aria}>${body}</svg>`;
}

export function fileIcon(mime = "", name = "") {
  const m = String(mime), n = String(name);
  const key =
    /pdf/.test(m) || /\.pdf$/i.test(n) ? "filePdf" :
    /zip|gzip|compress|tar/.test(m) || /\.(zip|gz|tgz|7z|rar)$/i.test(n) ? "fileZip" :
    /audio/.test(m) ? "fileAudio" :
    /video/.test(m) ? "fileVideo" :
    /word|document|msword/.test(m) || /\.docx?$/i.test(n) ? "fileDoc" :
    /sheet|excel/.test(m) || /\.xlsx?$/i.test(n) ? "fileSheet" :
    /image/.test(m) || /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(n) ? "fileImage" :
    /text|json/.test(m) || /\.(txt|md|json|csv)$/i.test(n) ? "fileText" :
    "clip";
  return ic(key);
}

export function svgDocument(name, { size = 24, color = "#1d1813", background = "none" } = {}) {
  const inner = ic(name).replace(/<svg\b[^>]*>/, "").replace(/<\/svg>/, "");
  const bg = background && background !== "none"
    ? `<rect width="100%" height="100%" fill="${esc(background)}"/>`
    : "";
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="${esc(color)}" stroke-width="${ICON_STROKE}" stroke-linecap="round" stroke-linejoin="round">${bg}${inner}</svg>`;
}
