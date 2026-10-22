// 极简安全 Markdown 渲染：先整体转义 HTML，再做有限的格式化；链接只允许 http(s)。无外部依赖，符合 CSP。
const esc = s => s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const KW = /\b(const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|new|class|extends|import|from|export|default|async|await|try|catch|finally|throw|typeof|instanceof|in|of|def|lambda|pass|elif|None|True|False|null|undefined|true|false|this|self|fn|pub|struct|impl|use|mod|match|go|func|package|type|interface|echo|then|fi|done|esac)\b/g;
// 代码高亮：在已转义文本上按 token 处理，占位避免互相覆盖
function hl(code) {
  const keep = []; const put = (cls, t) => `\u0000${String.fromCharCode(0xE000 + keep.push(`<span class="tk-${cls}">${t}</span>`) - 1)}\u0000`;
  let s = code
    .replace(/(\/\*[\s\S]*?\*\/|(?:^|\s)(?:\/\/|#)[^\n]*)/g, m => put("c", m))
    .replace(/(&quot;|&#39;|`)(?:(?!\1)[^\n\\]|\\.)*?\1/g, m => put("s", m))
    .replace(/\b\d+(?:\.\d+)?\b/g, m => put("n", m))
    .replace(KW, m => put("k", m));
  return s.replace(/\u0000([\uE000-\uF8FF])\u0000/g, (_, c) => keep[c.charCodeAt(0) - 0xE000]);
}
function inline(t) {
  const codes = [];
  t = t.replace(/`([^`\n]+)`/g, (_, c) => `\u0001${codes.push(`<code>${c}</code>`) - 1}\u0001`);
  t = t.replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, (_, a, u) => `<a href="${u}" target="_blank" rel="noopener noreferrer">${a}</a>`)
    .replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, (_, p, u) => `${p}<a href="${u}" target="_blank" rel="noopener noreferrer">${u}</a>`)
    .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>")
    .replace(/~~([^~\n]+)~~/g, "<del>$1</del>");
  return t.replace(/\u0001(\d+)\u0001/g, (_, i) => codes[i]);
}
export function md(src) {
  const blocks = [];
  let s = esc(String(src ?? "")).replace(/\r\n/g, "\n");
  s = s.replace(/```([\w+-]*)\n?([\s\S]*?)(?:```|$)/g, (_, lang, code) =>
    `\n\u0002${blocks.push(`<pre class="md-code"${lang ? ` data-lang="${lang}"` : ""}><code>${hl(code.replace(/\n$/, ""))}</code></pre>`) - 1}\u0002\n`);
  const out = []; let list = null, para = [];
  const flushP = () => { if (para.length) { out.push(`<p>${para.map(inline).join("<br>")}</p>`); para = []; } };
  const flushL = () => { if (list) { out.push(`<${list.t}>${list.items.map(i => `<li>${inline(i)}</li>`).join("")}</${list.t}>`); list = null; } };
  for (const line of s.split("\n")) {
    let m;
    if ((m = /^\u0002(\d+)\u0002$/.exec(line))) { flushP(); flushL(); out.push(blocks[m[1]]); }
    else if ((m = /^(#{1,4})\s+(.*)$/.exec(line))) { flushP(); flushL(); out.push(`<h${m[1].length + 2}>${inline(m[2])}</h${m[1].length + 2}>`); }
    else if ((m = /^\s*([-*+]|\d+[.)])\s+(.*)$/.exec(line))) { flushP(); const t = /\d/.test(m[1]) ? "ol" : "ul"; if (!list || list.t !== t) { flushL(); list = { t, items: [] }; } list.items.push(m[2]); }
    else if ((m = /^&gt;\s?(.*)$/.exec(line))) { flushP(); flushL(); out.push(`<blockquote>${inline(m[1])}</blockquote>`); }
    else if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) { flushP(); flushL(); out.push("<hr>"); }
    else if (!line.trim()) { flushP(); flushL(); }
    else { flushL(); para.push(line); }
  }
  flushP(); flushL();
  return out.join("");
}
