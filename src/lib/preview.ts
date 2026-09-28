import { environment } from "@raycast/api";
import { ChangeObject, diffArrays, diffChars } from "diff";

// Raycast markdown can't color text, so the preview is drawn as an SVG image (HTML inside foreignObject).
type Segment = { text: string; kind?: "added" | "removed" };

const WIDTH = 420;
const FONT_SIZE = 15;
const LINE_HEIGHT = 1.5;
const FONT = "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', sans-serif";
const DIFF_TIMEOUT_MS = 100;

const THEMES = {
  dark: { text: "#ececec", added: "rgba(63, 185, 80, 0.38)", removed: "rgba(248, 81, 73, 0.38)" },
  light: { text: "#1f1f1f", added: "rgba(46, 160, 67, 0.26)", removed: "rgba(229, 83, 75, 0.24)" },
};

export const renderText = (text: string) => render([{ text }]);

// jsdiff's word tokenizer knows only Latin letters and splits Cyrillic words letter by letter.
const TOKEN = /\r?\n|(?:(?![\p{sc=Han}\p{sc=Hiragana}\p{sc=Katakana}])[\p{L}\p{M}\p{N}_])+|[^\S\r\n]+|[\s\S]/gu;

const tokenize = (text: string) => text.match(TOKEN) ?? [];

export function renderDiff(before: string, after: string) {
  const parts = diffArrays(tokenize(before), tokenize(after), { timeout: DIFF_TIMEOUT_MS });
  // A near-total rewrite of a long text hits the timeout; show it unhighlighted rather than freeze the UI.
  if (!parts) return renderText(after);
  const changes = parts.map(toSegment);
  const segments: Segment[] = [];
  for (let i = 0; i < changes.length; i++) {
    const next = changes[i + 1];
    const chars =
      changes[i].kind === "removed" && next?.kind === "added" ? charDiff(changes[i].text, next.text) : undefined;
    if (chars) {
      segments.push(...chars);
      i++;
    } else segments.push(changes[i]);
  }
  return render(segments);
}

const toSegment = ({ value, added, removed }: ChangeObject<string | string[]>): Segment => ({
  text: typeof value === "string" ? value : value.join(""),
  kind: added ? "added" : removed ? "removed" : undefined,
});

// Typo and capitalization fixes read better per character (h→H, j[u]st), like Raycast's own diff.
function charDiff(a: string, b: string) {
  if (/\s/.test(a) || /\s/.test(b)) return undefined;
  const parts = diffChars(a, b, { timeout: DIFF_TIMEOUT_MS });
  if (!parts) return undefined;
  const common = parts.reduce((n, part) => (part.added || part.removed ? n : n + part.value.length), 0);
  return common * 2 >= Math.max(a.length, b.length) ? parts.map(toSegment) : undefined;
}

// XML rejects most control characters (PowerPoint copies \v line breaks), which would blank the whole image.
const toXmlText = (text: string) => text.replace(/\r\n?|[\v\f]/g, "\n").replace(/[^\P{Cc}\t\n]/gu, "");

function render(raw: Segment[]) {
  const segments = raw.map(({ text, kind }) => ({ text: toXmlText(text), kind }));
  const text = segments.map((segment) => segment.text).join("");
  if (!text.trim()) return "";
  const theme = THEMES[environment.appearance];
  // One spare line absorbs wrap-estimate errors; it only adds space below the text.
  const height = Math.ceil((countLines(text) + 1) * FONT_SIZE * LINE_HEIGHT);
  const html = segments
    .map(({ text, kind }) => (kind ? `<span class="${kind}">${escapeXml(text)}</span>` : escapeXml(text)))
    .join("");
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${height}"><style>` +
    `div{font:${FONT_SIZE}px/${LINE_HEIGHT} ${FONT};color:${theme.text};white-space:pre-wrap;overflow-wrap:break-word}` +
    `span{border-radius:3px}.added{background:${theme.added}}` +
    `.removed{background:${theme.removed};text-decoration:line-through}</style>` +
    `<foreignObject width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml">${html}</div></foreignObject></svg>`;
  return `![](data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")})`;
}

const escapeXml = (text: string) =>
  text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]!);

// The image height has to be fixed up front, so wrapping is simulated with rough SF Pro glyph widths (in em).
function charWidth(ch: string) {
  if (ch === " ") return 0.28;
  if (ch === "\t") return 8 * 0.28;
  if (/[a-z]/.test(ch)) return "mw".includes(ch) ? 0.8 : "ijlft".includes(ch) ? 0.3 : 0.53;
  if (/[A-Z]/.test(ch)) return "MW".includes(ch) ? 0.9 : "IJ".includes(ch) ? 0.3 : 0.67;
  if (/[0-9]/.test(ch)) return 0.6;
  if (ch.charCodeAt(0) < 128) return 0.38;
  if (/\p{Extended_Pictographic}/u.test(ch)) return 1.4;
  if (/[⺀-鿿가-힯豈-﫿]/u.test(ch)) return 1.2;
  return 0.6;
}

const measure = (text: string) => [...text].reduce((width, ch) => width + charWidth(ch), 0) * FONT_SIZE;

function countLines(text: string) {
  let lines = 0;
  for (const line of text.split("\n")) {
    lines++;
    let x = 0;
    for (const token of line.split(/(\s+)/)) {
      if (!token) continue;
      const width = measure(token);
      if (/^\s+$/.test(token)) {
        x += width;
        continue;
      }
      if (x > 0 && x + width > WIDTH) {
        lines++;
        x = 0;
      }
      lines += Math.floor(width / WIDTH);
      x += width % WIDTH;
    }
  }
  return lines;
}
