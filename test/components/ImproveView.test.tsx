import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { isValidElement, ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { ImproveView } from "../../src/components/ImproveView";
import { ModelList } from "../../src/components/ModelList";
import { PromptForm } from "../../src/components/PromptForm";
import * as preview from "../../src/lib/preview";
import { decodePreview, mockOpenRouter } from "../helpers";
import { Clipboard, LocalStorage, navigation, openExtensionPreferences, showToast } from "../mocks/raycast-api";

vi.mock("../../src/lib/preview", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/lib/preview")>();
  return { ...actual, renderDiff: vi.fn(actual.renderDiff) };
});

type Api = ReturnType<typeof mockOpenRouter>;

async function openView(original = "helo world\n") {
  const api = mockOpenRouter();
  const view = render(<ImproveView original={original} />);
  await waitFor(() => expect(api.streams).toHaveLength(1));
  return { api, view };
}

const list = () => screen.getByTestId("list");
const items = () => screen.getAllByRole("listitem");
const titles = () => items().map((item) => item.getAttribute("aria-label"));
const item = (title: string) => screen.getByRole("listitem", { name: title });
const actionTitles = (element: HTMLElement) =>
  within(element)
    .queryAllByRole("button")
    .map((button) => button.dataset.action);
const action = (element: HTMLElement, name: string) => within(element).getByRole("button", { name });
const markdownOf = (element: HTMLElement) =>
  element.querySelector<HTMLElement>('[data-testid="item-detail"]')!.dataset.markdown!;
const typeFollowUp = (text: string) => fireEvent.change(screen.getByLabelText("Search"), { target: { value: text } });

async function finishWith(api: Api, index: number, ...deltas: string[]) {
  deltas.forEach((delta) => api.streams[index].delta(delta));
  api.streams[index].finish();
  await waitFor(() => expect(list().dataset.loading).toBe("false"));
}

describe("ImproveView while streaming", () => {
  it("starts streaming the first version right away", async () => {
    await openView();
    expect(list().dataset.loading).toBe("true");
    expect(list().dataset.selected).toBe("turn-0");
    expect(titles()).toEqual(["Improved", "Original"]);
    expect(item("Improved").querySelector('[data-part="accessory"]')!.textContent).toBe("writing…");
  });

  it("offers only Stop as the primary action and no paste yet", async () => {
    await openView();
    const actions = actionTitles(item("Improved"));
    expect(actions[0]).toBe("Stop Generating");
    expect(actions).not.toContain("Paste Response");
    expect(actions).not.toContain("Copy Response");
  });

  it("shows the streamed text as plain text", async () => {
    const { api } = await openView();
    api.streams[0].delta("Hello wo");
    await waitFor(() => expect(markdownOf(item("Improved"))).not.toBe(""));
    const shown = decodePreview(markdownOf(item("Improved")));
    expect(shown.text).toBe("Hello wo");
    expect(shown.added).toEqual([]);
  });

  it("sends the selection without its surrounding whitespace", async () => {
    const { api } = await openView("\n  helo world  \n");
    const messages = api.chatCalls()[0].body!.messages as { content: string }[];
    expect(messages[1].content).toBe("<text>\nhelo world\n</text>");
  });

  it("aborts the request when the view closes", async () => {
    const { api, view } = await openView();
    view.unmount();
    expect(api.chatCalls()[0].init.signal!.aborted).toBe(true);
  });
});

describe("ImproveView when a version is done", () => {
  it("shows the changes against the selection", async () => {
    const { api } = await openView();
    await finishWith(api, 0, "Hello ", "world.");
    const shown = decodePreview(markdownOf(item("Improved")));
    expect(shown.after).toBe("Hello world.");
    expect(shown.added).toEqual(expect.arrayContaining(["l", "."]));
    expect(item("Improved").querySelector('[data-part="accessory"]')).toBeNull();
  });

  it("pastes and copies the reply with the selection's surrounding whitespace", async () => {
    const { api } = await openView("  helo world\n");
    await finishWith(api, 0, "Hello world.");
    const improved = item("Improved");
    expect(actionTitles(improved).slice(0, 2)).toEqual(["Paste Response", "Copy Response"]);
    expect(action(improved, "Paste Response").dataset.content).toBe("  Hello world.\n");
    expect(action(improved, "Copy Response").dataset.content).toBe("  Hello world.\n");

    fireEvent.click(action(improved, "Paste Response"));
    await waitFor(() => expect(Clipboard.paste).toHaveBeenCalledWith("  Hello world.\n"));
    fireEvent.click(action(improved, "Copy Response"));
    await waitFor(() => expect(Clipboard.copy).toHaveBeenCalledWith("  Hello world.\n"));
  });

  it("lists the original unchanged, without paste, but with Copy Original", async () => {
    const { api } = await openView("helo world\n");
    await finishWith(api, 0, "Hello world.");
    const original = item("Original");
    expect(decodePreview(markdownOf(original)).text).toBe("helo world");
    expect(actionTitles(original)).not.toContain("Paste Response");
    expect(action(original, "Copy Original").dataset.content).toBe("helo world\n");
  });

  it("computes each finished version's diff once, not on every stream update", async () => {
    const { api } = await openView();
    await finishWith(api, 0, "Hello world.");
    vi.mocked(preview.renderDiff).mockClear();
    typeFollowUp("shorter");
    fireEvent.click(action(item("Improved"), "Send Follow-Up"));
    await waitFor(() => expect(api.streams).toHaveLength(2));
    for (const delta of ["Hi", " there", " world"]) {
      api.streams[1].delta(delta);
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    expect(preview.renderDiff).not.toHaveBeenCalled();
  });

  it("opens the extension preferences", async () => {
    const { api } = await openView();
    await finishWith(api, 0, "Hello.");
    fireEvent.click(action(item("Improved"), "Open Extension Preferences"));
    expect(openExtensionPreferences).toHaveBeenCalled();
  });
});

describe("ImproveView failures", () => {
  it("shows the API error and a failure toast", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response('{"error":{"message":"No auth credentials found"}}', { status: 401 })),
    );
    render(<ImproveView original="helo" />);
    await waitFor(() => expect(list().dataset.loading).toBe("false"));
    expect(markdownOf(item("Improved"))).toBe(
      "## Couldn't improve the text\n\nInvalid OpenRouter API key (No auth credentials found)",
    );
    expect(actionTitles(item("Improved"))).not.toContain("Paste Response");
    expect(showToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Couldn't improve the text",
        message: "Invalid OpenRouter API key (No auth credentials found)",
      }),
    );
  });

  it("fails an empty reply instead of offering to paste nothing", async () => {
    const { api } = await openView();
    await finishWith(api, 0, "  ");
    expect(markdownOf(item("Improved"))).toBe("## Couldn't improve the text\n\nThe model returned an empty reply");
    expect(actionTitles(item("Improved"))).not.toContain("Paste Response");
  });

  it("does not offer to paste a reply that was cut off", async () => {
    const { api } = await openView();
    api.streams[0].delta("Half a sen");
    api.streams[0].finish("length");
    await waitFor(() => expect(list().dataset.loading).toBe("false"));
    expect(markdownOf(item("Improved"))).toContain("cut off");
    expect(actionTitles(item("Improved"))).not.toContain("Paste Response");
  });
});

describe("ImproveView Stop", () => {
  it("keeps the partial text as a finished version", async () => {
    const { api } = await openView();
    api.streams[0].delta("Hello wor");
    await waitFor(() => expect(markdownOf(item("Improved"))).not.toBe(""));
    fireEvent.click(action(item("Improved"), "Stop Generating"));
    await waitFor(() => expect(list().dataset.loading).toBe("false"));
    expect(action(item("Improved"), "Paste Response").dataset.content).toBe("Hello wor\n");
    expect(showToast).not.toHaveBeenCalled();
  });
});

describe("ImproveView follow-ups", () => {
  it("turns ↵ into Send Follow-Up while the search bar has text", async () => {
    const { api } = await openView();
    await finishWith(api, 0, "Hello world.");
    typeFollowUp("  ");
    expect(actionTitles(item("Improved"))[0]).toBe("Paste Response");
    typeFollowUp("shorter");
    expect(actionTitles(item("Improved")).slice(0, 2)).toEqual(["Send Follow-Up", "Paste Response"]);
    expect(actionTitles(item("Original"))[0]).toBe("Send Follow-Up");
  });

  it("revises the latest version and lists the new one on top", async () => {
    const { api } = await openView();
    await finishWith(api, 0, "Hello world, how are you doing today?");
    typeFollowUp("  shorter ");
    fireEvent.click(action(item("Improved"), "Send Follow-Up"));
    await waitFor(() => expect(api.streams).toHaveLength(2));

    expect((screen.getByLabelText("Search") as HTMLInputElement).value).toBe("");
    expect(titles()).toEqual(["shorter", "Improved", "Original"]);
    expect(list().dataset.selected).toBe("turn-1");
    expect(item("shorter").dataset.icon).toBe("Message");
    expect(item("Improved").dataset.icon).toBe("Wand");
    const messages = api.chatCalls()[1].body!.messages as { role: string; content: string }[];
    expect(messages.slice(2)).toEqual([
      { role: "assistant", content: "Hello world, how are you doing today?" },
      { role: "user", content: "Revise your last version: shorter\nReply with the full revised text only." },
    ]);

    await finishWith(api, 1, "Hi, how are you?");
    expect(action(item("shorter"), "Paste Response").dataset.content).toBe("Hi, how are you?\n");
    expect(action(item("Improved"), "Paste Response").dataset.content).toBe("Hello world, how are you doing today?\n");
  });

  it("each follow-up builds on the previous ones", async () => {
    const { api } = await openView();
    await finishWith(api, 0, "v1");
    typeFollowUp("shorter");
    fireEvent.click(action(item("Improved"), "Send Follow-Up"));
    await waitFor(() => expect(api.streams).toHaveLength(2));
    await finishWith(api, 1, "v2");
    typeFollowUp("casual");
    fireEvent.click(action(item("shorter"), "Send Follow-Up"));
    await waitFor(() => expect(api.streams).toHaveLength(3));
    const messages = api.chatCalls()[2].body!.messages as { content: string }[];
    expect(messages.slice(2).map((m) => m.content)).toEqual([
      "v1",
      "Revise your last version: shorter\nReply with the full revised text only.",
      "v2",
      "Revise your last version: casual\nReply with the full revised text only.",
    ]);
  });

  it("after a failed first version, asks for the change on the original text", async () => {
    const { api } = await openView();
    await finishWith(api, 0, "");
    typeFollowUp("more casual");
    fireEvent.click(action(item("Improved"), "Send Follow-Up"));
    await waitFor(() => expect(api.streams).toHaveLength(2));
    const messages = api.chatCalls()[1].body!.messages as { role: string; content: string }[];
    expect(messages).toHaveLength(3);
    expect(messages[2]).toEqual({ role: "user", content: "Also: more casual" });
    expect(titles()).toEqual(["more casual", "Original"]);
    expect(item("more casual").dataset.icon).toBe("Message");
  });
});

describe("ImproveView presets", () => {
  const presets = ["Shorter", "More Formal", "More Casual", "Fix Grammar Only", "Translate to English", "Humanize"];
  const lastMessage = (api: Api, index: number) =>
    (api.chatCalls()[index].body!.messages as { role: string; content: string }[]).at(-1)!;

  it("offers the presets once a version is done, after the other actions", async () => {
    const { api } = await openView();
    expect(actionTitles(item("Improved"))).not.toContain("Shorter");
    await finishWith(api, 0, "Hello world.");
    expect(actionTitles(item("Improved")).slice(-presets.length)).toEqual(presets);
    expect(actionTitles(item("Original"))[0]).toBe("Regenerate");
  });

  it("revises the latest version and titles it with the preset", async () => {
    const { api } = await openView();
    await finishWith(api, 0, "Hello world, how are you doing today?");
    fireEvent.click(action(item("Improved"), "Shorter"));
    await waitFor(() => expect(api.streams).toHaveLength(2));
    expect(titles()).toEqual(["Shorter", "Improved", "Original"]);
    expect(lastMessage(api, 1)).toEqual({
      role: "user",
      content: "Revise your last version: make it shorter\nReply with the full revised text only.",
    });

    await finishWith(api, 1, "Hi, how are you?");
    fireEvent.click(action(item("Shorter"), "Regenerate"));
    await waitFor(() => expect(api.streams).toHaveLength(3));
    expect(titles()).toEqual(["Shorter", "Improved", "Original"]);
  });

  it("Humanize sends the humanizer guide", async () => {
    const { api } = await openView();
    await finishWith(api, 0, "Hello world.");
    fireEvent.click(action(item("Improved"), "Humanize"));
    await waitFor(() => expect(api.streams).toHaveLength(2));
    expect(titles()).toEqual(["Humanize", "Improved", "Original"]);
    const { content } = lastMessage(api, 1);
    expect(content).toMatch(/^Revise your last version: remove the signs of AI writing/);
    expect(content).toContain("<guide>\n---\nname: humanizer\n");
    expect(content).toContain("# Humanizer: remove AI writing patterns");
  });
});

describe("ImproveView regenerate", () => {
  it("replaces the first version with a new sample", async () => {
    const { api } = await openView();
    await finishWith(api, 0, "Hello world.");
    fireEvent.click(action(item("Improved"), "Regenerate"));
    await waitFor(() => expect(api.streams).toHaveLength(2));
    expect(titles()).toEqual(["Improved", "Original"]);
    expect(list().dataset.loading).toBe("true");
    expect(api.chatCalls()[1].body!.messages).toEqual(api.chatCalls()[0].body!.messages);
    await finishWith(api, 1, "Hello, world!");
    expect(action(item("Improved"), "Paste Response").dataset.content).toBe("Hello, world!\n");
  });

  it("re-runs the latest follow-up with the same history", async () => {
    const { api } = await openView();
    await finishWith(api, 0, "v1");
    typeFollowUp("shorter");
    fireEvent.click(action(item("Improved"), "Send Follow-Up"));
    await waitFor(() => expect(api.streams).toHaveLength(2));
    await finishWith(api, 1, "v2");
    fireEvent.click(action(item("shorter"), "Regenerate"));
    await waitFor(() => expect(api.streams).toHaveLength(3));
    expect(api.chatCalls()[2].body!.messages).toEqual(api.chatCalls()[1].body!.messages);
    expect(titles()).toEqual(["shorter", "Improved", "Original"]);
  });

  it("aborts the running stream and ignores its late output", async () => {
    const { api } = await openView();
    api.streams[0].delta("Old");
    fireEvent.click(action(item("Improved"), "Regenerate"));
    await waitFor(() => expect(api.streams).toHaveLength(2));
    expect(api.chatCalls()[0].init.signal!.aborted).toBe(true);
    await finishWith(api, 1, "New");
    expect(action(item("Improved"), "Paste Response").dataset.content).toBe("New\n");
  });
});

describe("ImproveView model and prompt changes", () => {
  const pushed = () => {
    const target = navigation.push.mock.calls.at(-1)![0];
    expect(isValidElement(target)).toBe(true);
    return target as ReactElement<Record<string, () => void>>;
  };

  it("Change Model… opens the model list, and picking one pops back and regenerates with it", async () => {
    const { api } = await openView();
    await finishWith(api, 0, "Hello.");
    fireEvent.click(action(item("Improved"), "Change Model…"));
    const target = pushed();
    expect(target.type).toBe(ModelList);

    await LocalStorage.setItem("activeModel", "anthropic/claude-sonnet-5");
    target.props.onPick();
    expect(navigation.pop).toHaveBeenCalled();
    await waitFor(() => expect(api.streams).toHaveLength(2));
    expect(api.chatCalls()[1].body!.model).toBe("anthropic/claude-sonnet-5");
  });

  it("Edit Prompt… opens the prompt form, and saving pops back and regenerates with the new prompt", async () => {
    const { api } = await openView();
    await finishWith(api, 0, "Hello.");
    fireEvent.click(action(item("Improved"), "Edit Prompt…"));
    const target = pushed();
    expect(target.type).toBe(PromptForm);

    await LocalStorage.setItem("prompt", "Write like a pirate.");
    target.props.onSaved();
    expect(navigation.pop).toHaveBeenCalled();
    await waitFor(() => expect(api.streams).toHaveLength(2));
    const system = (api.chatCalls()[1].body!.messages as { content: string }[])[0].content;
    expect(system.startsWith("Write like a pirate.")).toBe(true);
  });
});
