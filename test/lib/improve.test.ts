import { describe, expect, it, vi } from "vitest";
import { FLUSH_MS, followUpHistory, generateTurn, turnPreview, TurnState } from "../../src/lib/improve";
import { DEFAULT_PROMPT, OUTPUT_CONTRACT, Turn } from "../../src/lib/prompt";
import { decodePreview, mockOpenRouter } from "../helpers";
import { LocalStorage } from "../mocks/raycast-api";

function start(options: Partial<Parameters<typeof generateTurn>[0]> = {}) {
  const api = mockOpenRouter();
  const updates: TurnState[] = [];
  const controller = new AbortController();
  const result = generateTurn({
    apiKey: "sk-test",
    effort: "medium",
    text: "helo world",
    history: [],
    signal: controller.signal,
    onUpdate: (state) => updates.push(state),
    ...options,
  });
  const stream = async () => {
    await vi.waitFor(() => expect(api.streams).toHaveLength(1));
    return api.streams[0];
  };
  return { api, updates, controller, result, stream };
}

describe("generateTurn", () => {
  it("requests the active model with the saved prompt, effort and history", async () => {
    await LocalStorage.setItem("prompt", "Make it formal.");
    await LocalStorage.setItem("activeModel", "anthropic/claude-sonnet-5");
    const history: Turn[] = [{ reply: "Hello world", status: "done" }];
    const run = start({ history, instruction: "shorter", apiKey: "sk-live" });
    (await run.stream()).finish();
    await run.result;

    const [call] = run.api.chatCalls();
    expect((call.init.headers as Record<string, string>).Authorization).toBe("Bearer sk-live");
    expect(call.body).toMatchObject({
      model: "anthropic/claude-sonnet-5",
      reasoning: { effort: "medium", exclude: true },
    });
    expect(call.body?.messages).toEqual([
      { role: "system", content: `Make it formal.\n\n${OUTPUT_CONTRACT}` },
      { role: "user", content: "<text>\nhelo world\n</text>" },
      { role: "assistant", content: "Hello world" },
      { role: "user", content: "Revise your last version: shorter\nReply with the full revised text only." },
    ]);
  });

  it("uses the default prompt and preference model when nothing is saved", async () => {
    const run = start();
    const stream = await run.stream();
    stream.delta("x");
    stream.finish();
    await run.result;
    const body = run.api.chatCalls()[0].body!;
    expect(body.model).toBe("openai/gpt-6-luna");
    expect((body.messages as { content: string }[])[0].content).toContain(DEFAULT_PROMPT);
  });

  it("reports streaming snapshots at most every FLUSH_MS", async () => {
    let now = 10_000;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    const run = start();
    const stream = await run.stream();

    stream.delta("Hel");
    await vi.waitFor(() => expect(run.updates).toHaveLength(1));
    now += FLUSH_MS - 1;
    stream.delta("lo");
    stream.delta(",");
    await vi.waitFor(() => expect(run.api.streams).toHaveLength(1));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(run.updates).toHaveLength(1);
    now += 1;
    stream.delta(" world");
    await vi.waitFor(() => expect(run.updates).toHaveLength(2));
    stream.finish();

    expect(await run.result).toEqual({ reply: "Hello, world", status: "done" });
    expect(run.updates).toEqual([
      { reply: "Hel", status: "streaming" },
      { reply: "Hello, world", status: "streaming" },
    ]);
  });

  it("strips an echoed <text> wrapper from snapshots and the result", async () => {
    const run = start();
    const stream = await run.stream();
    stream.delta("<text>\nHello");
    await vi.waitFor(() => expect(run.updates[0]).toEqual({ reply: "Hello", status: "streaming" }));
    stream.delta(" world\n</text>");
    stream.finish();
    expect(await run.result).toEqual({ reply: "Hello world", status: "done" });
  });

  it("fails an empty reply", async () => {
    const run = start();
    const stream = await run.stream();
    stream.delta("  \n");
    stream.finish();
    expect(await run.result).toEqual({ reply: "", status: "failed", error: "The model returned an empty reply" });
  });

  it("fails with the API error message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response('{"error":{"message":"No auth credentials found"}}', { status: 401 })),
    );
    const result = await generateTurn({
      apiKey: "bad",
      effort: "low",
      text: "x",
      history: [],
      signal: new AbortController().signal,
      onUpdate: () => {},
    });
    expect(result).toEqual({
      reply: "",
      status: "failed",
      error: "Invalid OpenRouter API key (No auth credentials found)",
    });
  });

  it("fails a reply cut off mid-way but keeps the partial text", async () => {
    const run = start();
    const stream = await run.stream();
    stream.delta("Half a sen");
    stream.finish("length");
    expect(await run.result).toEqual({
      reply: "Half a sen",
      status: "failed",
      error: "The reply hit the model's output limit and was cut off",
    });
  });

  it("keeps the partial text as done when stopped", async () => {
    const run = start();
    const stream = await run.stream();
    stream.delta("Partial");
    await vi.waitFor(() => expect(run.updates).toHaveLength(1));
    run.controller.abort();
    expect(await run.result).toEqual({ reply: "Partial", status: "done" });
  });

  it("stopping before any text arrives gives an empty done turn, not a failure", async () => {
    const run = start();
    await run.stream();
    run.controller.abort();
    expect(await run.result).toEqual({ reply: "", status: "done" });
  });
});

describe("followUpHistory", () => {
  it("keeps only finished versions that have text", () => {
    const turns: Turn[] = [
      { reply: "v1", status: "done" },
      { reply: "", status: "done" },
      { reply: "partial", status: "failed", error: "cut off", instruction: "longer" },
      { reply: "v2", status: "done", instruction: "shorter" },
      { reply: "v3…", status: "streaming", instruction: "casual" },
    ];
    expect(followUpHistory(turns)).toEqual([turns[0], turns[3]]);
  });
});

describe("turnPreview", () => {
  it("shows the error for a failed turn", () => {
    expect(turnPreview({ reply: "", status: "failed", error: "Boom" }, "text")).toBe(
      "## Couldn't improve the text\n\nBoom",
    );
  });

  it("shows plain text while streaming", () => {
    const preview = decodePreview(turnPreview({ reply: "Hello wor", status: "streaming" }, "helo world"));
    expect(preview.text).toBe("Hello wor");
    expect(preview.added).toEqual([]);
  });

  it("shows the diff against the selection once done", () => {
    const preview = decodePreview(turnPreview({ reply: "Hello world", status: "done" }, "helo world"));
    expect(preview.after).toBe("Hello world");
    expect(preview.added.length + preview.removed.length).toBeGreaterThan(0);
  });
});
