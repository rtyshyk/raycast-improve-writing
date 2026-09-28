import { describe, expect, it } from "vitest";
import {
  buildMessages,
  cleanReply,
  DEFAULT_PROMPT,
  getPrompt,
  OUTPUT_CONTRACT,
  savePrompt,
  splitSelection,
  Turn,
} from "../../src/lib/prompt";
import { LocalStorage } from "../mocks/raycast-api";

const done = (reply: string, instruction?: string): Turn => ({ reply, instruction, status: "done" });

describe("getPrompt", () => {
  it("returns the default prompt when none is saved", async () => {
    expect(await getPrompt()).toBe(DEFAULT_PROMPT);
  });

  it("returns the saved prompt", async () => {
    await LocalStorage.setItem("prompt", "Make it pirate speak.");
    expect(await getPrompt()).toBe("Make it pirate speak.");
  });
});

describe("savePrompt", () => {
  it("stores the trimmed prompt", async () => {
    await savePrompt("  Be terse.\n");
    expect(await LocalStorage.getItem("prompt")).toBe("Be terse.");
    expect(await getPrompt()).toBe("Be terse.");
  });

  it("removes the stored prompt when it is empty", async () => {
    await LocalStorage.setItem("prompt", "Old");
    await savePrompt("   ");
    expect(await LocalStorage.getItem("prompt")).toBeUndefined();
    expect(await getPrompt()).toBe(DEFAULT_PROMPT);
  });

  it("removes the stored prompt when it equals the default", async () => {
    await LocalStorage.setItem("prompt", "Old");
    await savePrompt(` ${DEFAULT_PROMPT} `);
    expect(await LocalStorage.getItem("prompt")).toBeUndefined();
  });
});

describe("buildMessages", () => {
  it("sends the prompt with the output contract and the text wrapped in tags", () => {
    expect(buildMessages("Fix it.", "helo world", [])).toEqual([
      { role: "system", content: `Fix it.\n\n${OUTPUT_CONTRACT}` },
      { role: "user", content: "<text>\nhelo world\n</text>" },
    ]);
  });

  it("replays history as assistant replies followed by revision requests", () => {
    const messages = buildMessages("P", "text", [done("v1"), done("v2", "shorter")], "more casual");
    expect(messages.slice(2)).toEqual([
      { role: "assistant", content: "v1" },
      { role: "user", content: "Revise your last version: shorter\nReply with the full revised text only." },
      { role: "assistant", content: "v2" },
      { role: "user", content: "Revise your last version: more casual\nReply with the full revised text only." },
    ]);
  });

  it("regenerating the first version sends no history", () => {
    expect(buildMessages("P", "text", [], undefined)).toHaveLength(2);
  });

  it("asks for an addition instead of a revision when there is no earlier version", () => {
    const messages = buildMessages("P", "text", [], "more casual");
    expect(messages.at(-1)).toEqual({ role: "user", content: "Also: more casual" });
  });
});

describe("cleanReply", () => {
  it("trims whitespace", () => {
    expect(cleanReply("  Hello.\n", "hello")).toBe("Hello.");
  });

  it("strips an echoed <text> wrapper", () => {
    expect(cleanReply("<text>\nHello.\n</text>", "hello")).toBe("Hello.");
    expect(cleanReply("<text>Hello.", "hello")).toBe("Hello.");
  });

  it("keeps the tags when the user's own text has them", () => {
    expect(cleanReply("<text>Hello</text>", "<text>hello</text>")).toBe("<text>Hello</text>");
    expect(cleanReply("<text>Hello", "<text>hello")).toBe("<text>Hello");
  });

  it("returns an empty string for an empty reply", () => {
    expect(cleanReply(" \n ", "hello")).toBe("");
  });
});

describe("splitSelection", () => {
  it("splits the surrounding whitespace from the body", () => {
    expect(splitSelection("\n  Hello world.\n\n")).toEqual({ lead: "\n  ", body: "Hello world.", trail: "\n\n" });
  });

  it("keeps whitespace inside the body", () => {
    expect(splitSelection("a\n\n  b")).toEqual({ lead: "", body: "a\n\n  b", trail: "" });
  });

  it("puts an all-whitespace selection in the lead", () => {
    expect(splitSelection("  \n")).toEqual({ lead: "  \n", body: "", trail: "" });
  });

  it("round-trips", () => {
    const selection = "\t Some text \n";
    const { lead, body, trail } = splitSelection(selection);
    expect(lead + body + trail).toBe(selection);
  });
});
