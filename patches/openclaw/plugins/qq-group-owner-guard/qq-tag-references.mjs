var VALID_TAGS = ["qqimg", "qqvoice", "qqvideo", "qqfile", "qqmedia"];
var TAG_ALIASES = {
  qq_img: "qqimg",
  qqimage: "qqimg",
  qq_image: "qqimg",
  qqpic: "qqimg",
  qq_pic: "qqimg",
  qqpicture: "qqimg",
  qq_picture: "qqimg",
  qqphoto: "qqimg",
  qq_photo: "qqimg",
  img: "qqimg",
  image: "qqimg",
  pic: "qqimg",
  picture: "qqimg",
  photo: "qqimg",
  qq_voice: "qqvoice",
  qqaudio: "qqvoice",
  qq_audio: "qqvoice",
  voice: "qqvoice",
  audio: "qqvoice",
  qq_video: "qqvideo",
  video: "qqvideo",
  qq_file: "qqfile",
  qqdoc: "qqfile",
  qq_doc: "qqfile",
  file: "qqfile",
  doc: "qqfile",
  document: "qqfile",
  qq_media: "qqmedia",
  media: "qqmedia",
  attachment: "qqmedia",
  attach: "qqmedia",
  qqattachment: "qqmedia",
  qq_attachment: "qqmedia",
  qqsend: "qqmedia",
  qq_send: "qqmedia",
  send: "qqmedia"
};
var ALL_TAG_NAMES = [...VALID_TAGS, ...Object.keys(TAG_ALIASES)];
ALL_TAG_NAMES.sort((a, b2) => b2.length - a.length);
var TAG_NAME_PATTERN = ALL_TAG_NAMES.join("|");
var LEFT_BRACKET = "(?:[<\uFF1C<]|&lt;)";
var RIGHT_BRACKET = "(?:[>\uFF1E>]|&gt;)";
var SELF_CLOSING_TAG_REGEX = new RegExp("`?" + LEFT_BRACKET + "\\s*(" + TAG_NAME_PATTERN + `)(?:\\s+(?!file|src|path|url)[a-z_-]+\\s*=\\s*["']?[^"'\\s\uFF1C<>\uFF1E>]*?["']?)*\\s+(?:file|src|path|url)\\s*=\\s*["']?([^"'\\s>\uFF1E]+?)["']?(?:\\s+[a-z_-]+\\s*=\\s*["']?[^"'\\s\uFF1C<>\uFF1E>]*?["']?)*\\s*/?\\s*` + RIGHT_BRACKET + "`?", "gi");
var FUZZY_MEDIA_TAG_REGEX = new RegExp("`?" + LEFT_BRACKET + "\\s*(" + TAG_NAME_PATTERN + ")\\s*" + RIGHT_BRACKET + `["']?\\s*([^<\uFF1C<\uFF1E>"'\`]+?)\\s*["']?` + LEFT_BRACKET + "\\s*/?\\s*(?:" + TAG_NAME_PATTERN + ")\\s*" + RIGHT_BRACKET + "`?", "gi");
var MULTILINE_TAG_CLEANUP = new RegExp("(" + LEFT_BRACKET + "\\s*(?:" + TAG_NAME_PATTERN + ")\\s*" + RIGHT_BRACKET + ")([\\s\\S]*?)(" + LEFT_BRACKET + "\\s*/?\\s*(?:" + TAG_NAME_PATTERN + ")\\s*" + RIGHT_BRACKET + ")", "gi");


export function qqMediaReferences(text) {
  const result = [];
  for (const re of [SELF_CLOSING_TAG_REGEX, FUZZY_MEDIA_TAG_REGEX]) for (const match of String(text || '').matchAll(new RegExp(re.source, re.flags))) result.push(match[2].trim());
  for (const match of String(text || '').matchAll(/(?:^|\n)\s*MEDIA:\s*([^\r\n]+)/gi)) result.push(match[1].trim());
  for (const match of String(text || '').matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)) result.push(match[1].trim().replace(/^<|>$/g, ''));
  return result;
}
