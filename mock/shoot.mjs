// 用 CDP 驱动无头 Chrome 截图：node shoot.mjs name url w h dark|light [js-before-shot]
import { spawn } from "node:child_process";
const [name, url, w, h, scheme, js] = process.argv.slice(2);
const port = 9300 + Math.floor(Math.random() * 500);
const ch = spawn("google-chrome", ["--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars", `--remote-debugging-port=${port}`, `--user-data-dir=/tmp/cdp-${port}`, "about:blank"], { stdio: "ignore" });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ws; for (let i = 0; i < 50; i++) { try { const t = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); const p = t.find(x => x.type === "page"); if (p) { ws = new WebSocket(p.webSocketDebuggerUrl); break; } } catch {} await sleep(150); }
await new Promise(r => ws.onopen = r);
let id = 0; const pend = new Map(); ws.onmessage = e => { const d = JSON.parse(e.data); if (pend.has(d.id)) { pend.get(d.id)(d.result); pend.delete(d.id); } };
const send = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const mobile = +w < 600;
await send("Emulation.setDeviceMetricsOverride", { width: +w, height: +h, deviceScaleFactor: 2, mobile });
if (mobile) await send("Emulation.setTouchEmulationEnabled", { enabled: true });
await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: scheme }] });
await send("Page.enable"); await send("Page.navigate", { url }); await sleep(1800);
if (js) { const r = await send("Runtime.evaluate", { expression: `(async () => { ${js} })()`, awaitPromise: true, returnByValue: true }); if (r?.result?.value !== undefined) console.log("eval:", JSON.stringify(r.result.value)); await sleep(1300); }
const { data } = await send("Page.captureScreenshot", { format: "png" });
(await import("node:fs")).writeFileSync(`/workspace/hosino/screens/${name}.png`, Buffer.from(data, "base64"));
ws.close(); ch.kill(); console.log("ok", name);
