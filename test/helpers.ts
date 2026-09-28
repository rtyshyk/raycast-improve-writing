import { vi } from "vitest";
import { OpenRouterModel } from "../src/lib/openrouter";

const encoder = new TextEncoder();

export const sseEvent = (payload: unknown) => `data: ${JSON.stringify(payload)}\n\n`;
export const deltaEvent = (content: string) => sseEvent({ choices: [{ delta: { content } }] });
export const finishEvent = (reason = "stop") => sseEvent({ choices: [{ delta: {}, finish_reason: reason }] });
export const DONE = "data: [DONE]\n\n";

// A response whose body emits the given chunks in order, then ends.
export function streamResponse(chunks: (string | Uint8Array)[], init?: ResponseInit) {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      chunks.forEach((chunk) => controller.enqueue(typeof chunk === "string" ? encoder.encode(chunk) : chunk));
      controller.close();
    },
  });
  return new Response(body, { status: 200, ...init });
}

// A stream the test drives step by step.
export function controlledStream() {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({ start: (c) => void (controller = c) });
  return {
    body,
    push: (text: string) => controller.enqueue(encoder.encode(text)),
    delta: (content: string) => controller.enqueue(encoder.encode(deltaEvent(content))),
    finish: (reason = "stop") => {
      controller.enqueue(encoder.encode(finishEvent(reason) + DONE));
      controller.close();
    },
    error: (reason: unknown) => controller.error(reason),
  };
}

type Call = { url: string; init: RequestInit; body?: Record<string, unknown> };

// Stubs fetch for both endpoints. Every chat request gets its own controlled stream, and aborting
// the request errors that stream the way a real fetch body does.
export function mockOpenRouter({ models = [] as unknown[], modelsStatus = 200 } = {}) {
  const streams: ReturnType<typeof controlledStream>[] = [];
  const calls: Call[] = [];
  const fetchMock = vi.fn(async (url: string, init: RequestInit = {}) => {
    calls.push({ url, init, body: init.body ? JSON.parse(String(init.body)) : undefined });
    if (url.endsWith("/models")) {
      return modelsStatus === 200
        ? Response.json({ data: models })
        : new Response('{"error":{"message":"down"}}', { status: modelsStatus });
    }
    const stream = controlledStream();
    streams.push(stream);
    init.signal?.addEventListener("abort", () =>
      stream.error(new DOMException("The operation was aborted.", "AbortError")),
    );
    return new Response(stream.body, { status: 200 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return {
    fetchMock,
    streams,
    chatCalls: () => calls.filter((call) => call.url.endsWith("/chat/completions")),
    modelCalls: () => calls.filter((call) => call.url.endsWith("/models")),
  };
}

const unescapeXml = (text: string) =>
  text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");

// Decodes a preview image back into what it shows: the full text, the highlighted parts and the size.
export function decodePreview(markdown: string) {
  const match = markdown.match(/^!\[\]\(data:image\/svg\+xml;base64,([A-Za-z0-9+/=]+)\)$/);
  if (!match) throw new Error(`Not a preview image: ${markdown.slice(0, 80)}`);
  const svg = Buffer.from(match[1], "base64").toString("utf8");
  const html = svg.match(/<div xmlns="http:\/\/www.w3.org\/1999\/xhtml">([\s\S]*)<\/div>/)![1];
  const spans = [...html.matchAll(/<span class="(added|removed)">([^<]*)<\/span>/g)];
  const strip = (markup: string) => unescapeXml(markup.replace(/<[^>]+>/g, ""));
  return {
    svg,
    width: Number(svg.match(/width="(\d+)"/)![1]),
    height: Number(svg.match(/height="(\d+)"/)![1]),
    text: strip(html),
    after: strip(html.replace(/<span class="removed">[^<]*<\/span>/g, "")),
    added: spans.filter(([, kind]) => kind === "added").map(([, , text]) => unescapeXml(text)),
    removed: spans.filter(([, kind]) => kind === "removed").map(([, , text]) => unescapeXml(text)),
  };
}

export const model = (id: string, overrides: Partial<OpenRouterModel> = {}): OpenRouterModel => ({
  id,
  name: `Provider: ${id.split("/")[1]}`,
  created: 1,
  context_length: 128000,
  pricing: { prompt: "0.000001", completion: "0.000002" },
  ...overrides,
});
