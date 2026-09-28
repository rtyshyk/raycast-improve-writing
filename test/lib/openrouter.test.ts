import { describe, expect, it, vi } from "vitest";
import { ChatMessage, fetchModels, streamChat } from "../../src/lib/openrouter";
import { controlledStream, deltaEvent, DONE, finishEvent, model, sseEvent, streamResponse } from "../helpers";

const messages: ChatMessage[] = [{ role: "user", content: "hi" }];

function stubFetch(response: Response | (() => Response)) {
  const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async () =>
    typeof response === "function" ? response() : response,
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function collect(response: Response, signal = new AbortController().signal) {
  stubFetch(response);
  const deltas: string[] = [];
  await streamChat({ apiKey: "k", model: "m", messages, effort: "low", signal, onDelta: (d) => deltas.push(d) });
  return deltas;
}

describe("streamChat request", () => {
  it("posts a streaming chat completion with auth, attribution and reasoning effort", async () => {
    const fetchMock = stubFetch(streamResponse([DONE]));
    const signal = new AbortController().signal;
    await streamChat({
      apiKey: "sk-or-123",
      model: "openai/gpt-6-luna",
      messages,
      effort: "high",
      signal,
      onDelta: () => {},
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(init?.method).toBe("POST");
    expect(init?.signal).toBe(signal);
    expect(init?.headers).toMatchObject({
      Authorization: "Bearer sk-or-123",
      "Content-Type": "application/json",
      "X-Title": "Improve Writing (Raycast)",
    });
    expect(JSON.parse(String(init?.body))).toEqual({
      model: "openai/gpt-6-luna",
      messages,
      stream: true,
      reasoning: { effort: "high", exclude: true },
    });
  });
});

describe("streamChat parsing", () => {
  it("reports each content delta in order", async () => {
    expect(await collect(streamResponse([deltaEvent("Hel"), deltaEvent("lo"), finishEvent(), DONE]))).toEqual([
      "Hel",
      "lo",
    ]);
  });

  it("joins events split across chunks, including a multi-byte character", async () => {
    const bytes = new TextEncoder().encode(deltaEvent("wörld"));
    const cut = bytes.indexOf(0xc3) + 1;
    const deltas = await collect(streamResponse([bytes.slice(0, cut), bytes.slice(cut), DONE]));
    expect(deltas).toEqual(["wörld"]);
  });

  it("ignores keep-alive comments and events without content", async () => {
    const deltas = await collect(
      streamResponse([
        ": OPENROUTER PROCESSING\n\n",
        sseEvent({ choices: [{ delta: { role: "assistant" } }] }),
        deltaEvent("x"),
        DONE,
      ]),
    );
    expect(deltas).toEqual(["x"]);
  });

  it("stops at [DONE] and ignores anything after it", async () => {
    expect(await collect(streamResponse([deltaEvent("a"), DONE, deltaEvent("late")]))).toEqual(["a"]);
  });

  it("handles a final line without a trailing newline", async () => {
    expect(
      await collect(
        streamResponse([deltaEvent("a"), `data: ${JSON.stringify({ choices: [{ delta: { content: "b" } }] })}`]),
      ),
    ).toEqual(["a", "b"]);
  });

  it("finishes when the stream ends without [DONE]", async () => {
    expect(await collect(streamResponse([deltaEvent("a")]))).toEqual(["a"]);
  });
});

describe("streamChat errors", () => {
  const failing = (status: number, body: string) => stubFetch(new Response(body, { status }));
  const run = () =>
    streamChat({
      apiKey: "k",
      model: "m",
      messages,
      effort: "low",
      signal: new AbortController().signal,
      onDelta: () => {},
    });

  it("explains a bad API key", async () => {
    failing(401, '{"error":{"message":"No auth credentials found"}}');
    await expect(run()).rejects.toThrow("Invalid OpenRouter API key (No auth credentials found)");
  });

  it("explains missing credits", async () => {
    failing(402, '{"error":{"message":"Insufficient credits"}}');
    await expect(run()).rejects.toThrow("Not enough OpenRouter credits (Insufficient credits)");
  });

  it("reports other statuses with the API message", async () => {
    failing(404, '{"error":{"message":"No endpoints found for bogus/model"}}');
    await expect(run()).rejects.toThrow("OpenRouter 404: No endpoints found for bogus/model");
  });

  it("falls back to the raw body when it isn't JSON", async () => {
    failing(502, "Bad gateway");
    await expect(run()).rejects.toThrow("OpenRouter 502: Bad gateway");
  });

  it("rejects a response without a body", async () => {
    stubFetch(new Response(null, { status: 200 }));
    await expect(run()).rejects.toThrow("OpenRouter returned an empty response");
  });

  it("throws an error sent mid-stream", async () => {
    stubFetch(streamResponse([deltaEvent("a"), sseEvent({ error: { message: "Provider overloaded" } })]));
    await expect(run()).rejects.toThrow("Provider overloaded");
  });

  it("treats a reply cut off by the output limit as an error", async () => {
    stubFetch(streamResponse([deltaEvent("a"), finishEvent("length"), DONE]));
    await expect(run()).rejects.toThrow("The reply hit the model's output limit and was cut off");
  });

  it("treats a content-filtered reply as an error", async () => {
    stubFetch(streamResponse([finishEvent("content_filter"), DONE]));
    await expect(run()).rejects.toThrow("The provider's content filter stopped the reply");
  });
});

describe("streamChat abort", () => {
  it("rejects with the abort error and stops reporting deltas", async () => {
    const stream = controlledStream();
    const controller = new AbortController();
    controller.signal.addEventListener("abort", () => stream.error(new DOMException("Aborted", "AbortError")));
    stubFetch(() => new Response(stream.body, { status: 200 }));
    const deltas: string[] = [];
    const pending = streamChat({
      apiKey: "k",
      model: "m",
      messages,
      effort: "low",
      signal: controller.signal,
      onDelta: (d) => deltas.push(d),
    });
    stream.delta("first");
    await vi.waitFor(() => expect(deltas).toEqual(["first"]));
    controller.abort();
    await expect(pending).rejects.toThrow("Aborted");
    expect(deltas).toEqual(["first"]);
  });
});

describe("fetchModels", () => {
  it("keeps text chat models and only the fields the list uses", async () => {
    const fetchMock = stubFetch(
      Response.json({
        data: [
          { ...model("openai/gpt-6-luna"), description: "long text", architecture: { output_modalities: ["text"] } },
          { ...model("openai/gpt-6-luna:batch") },
          { ...model("black-forest/flux"), architecture: { output_modalities: ["image"] } },
          { ...model("legacy/no-architecture") },
        ],
      }),
    );
    const models = await fetchModels();
    expect(fetchMock.mock.calls[0][0]).toBe("https://openrouter.ai/api/v1/models");
    expect(models.map((m) => m.id)).toEqual(["openai/gpt-6-luna", "legacy/no-architecture"]);
    expect(models[0]).toEqual({
      id: "openai/gpt-6-luna",
      name: "Provider: gpt-6-luna",
      created: 1,
      context_length: 128000,
      pricing: { prompt: "0.000001", completion: "0.000002" },
    });
  });

  it("throws the API error", async () => {
    stubFetch(new Response('{"error":{"message":"down"}}', { status: 503 }));
    await expect(fetchModels()).rejects.toThrow("OpenRouter 503: down");
  });
});
