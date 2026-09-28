import * as jsdiff from "diff";
import { describe, expect, it, vi } from "vitest";
import { renderDiff, renderText } from "../../src/lib/preview";
import { decodePreview } from "../helpers";
import { environment } from "../mocks/raycast-api";

vi.mock("diff", async (importOriginal) => {
  const actual = await importOriginal<typeof import("diff")>();
  return { ...actual, diffChars: vi.fn(actual.diffChars) };
});

const LINE = 15 * 1.5;
const heightFor = (lines: number) => Math.ceil((lines + 1) * LINE);

describe("renderText", () => {
  it("draws the text as an SVG image", () => {
    const preview = decodePreview(renderText("Hello world."));
    expect(preview.width).toBe(420);
    expect(preview.text).toBe("Hello world.");
    expect(preview.added).toEqual([]);
    expect(preview.removed).toEqual([]);
  });

  it("is empty for blank text", () => {
    expect(renderText("")).toBe("");
    expect(renderText("  \n\t")).toBe("");
  });

  it("escapes markup so the text shows literally", () => {
    const preview = decodePreview(renderText(`<b>Tom & "Jerry"</b> it's`));
    expect(preview.text).toBe(`<b>Tom & "Jerry"</b> it's`);
    expect(preview.svg).not.toContain("<b>");
  });

  it("normalizes line breaks and drops control characters XML rejects", () => {
    const preview = decodePreview(renderText("a\u000bb\u0000c\r\nd\re\ff"));
    expect(preview.text).toBe("a\nbc\nd\ne\nf");
    expect(preview.height).toBe(heightFor(5));
  });

  it("uses the theme's text color", () => {
    expect(decodePreview(renderText("x")).svg).toContain("color:#ececec");
    environment.appearance = "light";
    expect(decodePreview(renderText("x")).svg).toContain("color:#1f1f1f");
  });
});

describe("preview height", () => {
  it("adds one spare line below the text", () => {
    expect(decodePreview(renderText("one line")).height).toBe(heightFor(1));
  });

  it("counts explicit line breaks and blank lines", () => {
    expect(decodePreview(renderText("a\nb\n\nc")).height).toBe(heightFor(4));
  });

  it("grows when long text wraps", () => {
    const long = "The quick brown fox jumps over the lazy dog. ".repeat(10);
    expect(decodePreview(renderText(long)).height).toBeGreaterThanOrEqual(heightFor(6));
  });

  it("treats emoji as wider than letters", () => {
    expect(decodePreview(renderText("a".repeat(40))).height).toBe(heightFor(1));
    expect(decodePreview(renderText("😀".repeat(40))).height).toBeGreaterThan(heightFor(1));
  });

  it("treats a tab as much wider than a space", () => {
    expect(decodePreview(renderText(`${" ".repeat(20)}x`)).height).toBe(heightFor(1));
    expect(decodePreview(renderText(`${"\t".repeat(20)}x`)).height).toBe(heightFor(2));
  });
});

describe("renderDiff", () => {
  it("highlights added and removed words", () => {
    const preview = decodePreview(renderDiff("It is good.", "It was really good."));
    expect(preview.removed).toEqual(["is"]);
    expect(preview.added).toEqual(["was", "really "]);
    expect(preview.after).toBe("It was really good.");
  });

  it("shows nothing highlighted when the text is unchanged", () => {
    const preview = decodePreview(renderDiff("Same text.", "Same text."));
    expect(preview.added).toEqual([]);
    expect(preview.removed).toEqual([]);
  });

  it("marks typo fixes by character inside a word", () => {
    const preview = decodePreview(renderDiff("i jst had a look", "i just had a look"));
    expect(preview.added).toEqual(["u"]);
    expect(preview.removed).toEqual([]);
  });

  it("marks capitalization by character", () => {
    const preview = decodePreview(renderDiff("hello there", "Hello there"));
    expect(preview.removed).toEqual(["h"]);
    expect(preview.added).toEqual(["H"]);
  });

  it("replaces unrelated words whole", () => {
    const preview = decodePreview(renderDiff("the cat", "the dog"));
    expect(preview.removed).toEqual(["cat"]);
    expect(preview.added).toEqual(["dog"]);
  });

  it("compares Cyrillic word by word", () => {
    const preview = decodePreview(renderDiff("я бачив кота вчора", "я побачив собаку сьогодні"));
    expect(preview.after).toBe("я побачив собаку сьогодні");
    expect(preview.added).toContain("по");
    expect(preview.removed).toContain("кота");
    expect(preview.added).toContain("собаку");
    expect(preview.removed.every((part) => part.length > 1)).toBe(true);
  });

  it("compares Chinese character by character", () => {
    const preview = decodePreview(renderDiff("我喜欢猫", "我喜欢狗"));
    expect(preview.removed).toEqual(["猫"]);
    expect(preview.added).toEqual(["狗"]);
  });

  it("shows a paragraph merge as a removed break", () => {
    const preview = decodePreview(renderDiff("First para.\n\nSecond para.", "First para. Second para."));
    expect(preview.removed).toEqual(["\n\n"]);
    expect(preview.added).toEqual([" "]);
    expect(preview.after).toBe("First para. Second para.");
  });

  it("shows a paragraph split as an added break", () => {
    const preview = decodePreview(renderDiff("One. Two.", "One.\n\nTwo."));
    expect(preview.after).toBe("One.\n\nTwo.");
    expect(preview.added.join("")).toContain("\n\n");
  });

  it("falls back to the plain result when the diff runs past 100 ms", () => {
    let clock = 0;
    vi.spyOn(Date, "now").mockImplementation(() => (clock += 60));
    const preview = decodePreview(renderDiff("alpha beta gamma delta", "one two three four"));
    expect(preview.text).toBe("one two three four");
    expect(preview.added).toEqual([]);
    expect(preview.removed).toEqual([]);
  });

  it("falls back to word-level when the character diff runs past 100 ms", () => {
    vi.mocked(jsdiff.diffChars).mockReturnValueOnce(undefined as never);
    const preview = decodePreview(renderDiff("a jst b", "a just b"));
    expect(preview.removed).toEqual(["jst"]);
    expect(preview.added).toEqual(["just"]);
    expect(vi.mocked(jsdiff.diffChars).mock.calls[0][2]).toEqual({ timeout: 100 });
  });
});
