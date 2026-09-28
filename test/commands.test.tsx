import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import ChooseModel from "../src/choose-model";
import EditPrompt from "../src/edit-prompt";
import ImproveWriting from "../src/improve-writing";
import { DEFAULT_PROMPT } from "../src/lib/prompt";
import { mockOpenRouter, model } from "./helpers";
import { Clipboard, getSelectedText, showToast } from "./mocks/raycast-api";

type LaunchProps = Parameters<typeof ImproveWriting>[0];
const launch = (launchContext?: unknown) =>
  render(<ImproveWriting {...({ arguments: {}, launchContext } as unknown as LaunchProps)} />);

const sentText = async (api: ReturnType<typeof mockOpenRouter>) => {
  await waitFor(() => expect(api.chatCalls()).toHaveLength(1));
  return (api.chatCalls()[0].body!.messages as { content: string }[])[1].content;
};

describe("Improve Writing command", () => {
  it("improves the selected text", async () => {
    getSelectedText.mockResolvedValue("helo world");
    const api = mockOpenRouter();
    launch();
    expect(await sentText(api)).toBe("<text>\nhelo world\n</text>");
    expect(screen.getByTestId("list")).toBeTruthy();
  });

  it("shows a loading view while reading the selection", () => {
    getSelectedText.mockImplementation(() => new Promise(() => {}));
    launch();
    expect(screen.getByTestId("detail").dataset.loading).toBe("true");
  });

  it("explains when nothing is selected", async () => {
    launch();
    await waitFor(() => expect(screen.getByTestId("detail").dataset.markdown).toContain("## No text selected"));
    expect(screen.getByRole("button", { name: "Use Clipboard Text" })).toBeTruthy();
  });

  it("treats a whitespace-only selection as nothing selected", async () => {
    getSelectedText.mockResolvedValue("  \n ");
    launch();
    await waitFor(() => expect(screen.getByTestId("detail").dataset.markdown).toContain("## No text selected"));
  });

  it("improves the clipboard text on request", async () => {
    Clipboard.readText.mockResolvedValue("clipbord text");
    const api = mockOpenRouter();
    launch();
    fireEvent.click(await screen.findByRole("button", { name: "Use Clipboard Text" }));
    expect(await sentText(api)).toBe("<text>\nclipbord text\n</text>");
  });

  it("reports an empty clipboard", async () => {
    Clipboard.readText.mockResolvedValue(" ");
    launch();
    fireEvent.click(await screen.findByRole("button", { name: "Use Clipboard Text" }));
    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith(expect.objectContaining({ title: "Clipboard has no text" })),
    );
    expect(screen.getByTestId("detail")).toBeTruthy();
  });

  it("re-reads the selection when Raycast returns the old clipboard instead", async () => {
    Clipboard.readText.mockResolvedValue("amplitude");
    getSelectedText.mockResolvedValueOnce("amplitude").mockResolvedValueOnce("Hey team, can I get access?");
    const api = mockOpenRouter();
    launch();
    expect(await sentText(api)).toBe("<text>\nHey team, can I get access?\n</text>");
    expect(getSelectedText).toHaveBeenCalledTimes(2);
  });

  it("keeps a selection that really matches the clipboard, e.g. after copying it", async () => {
    Clipboard.readText.mockResolvedValue("copied and selected");
    getSelectedText.mockResolvedValue("copied and selected");
    const api = mockOpenRouter();
    launch();
    expect(await sentText(api)).toBe("<text>\ncopied and selected\n</text>");
  });

  it("keeps the first read when the retry fails", async () => {
    Clipboard.readText.mockResolvedValue("same");
    getSelectedText.mockResolvedValueOnce("same").mockRejectedValueOnce(new Error("no selection"));
    const api = mockOpenRouter();
    launch();
    expect(await sentText(api)).toBe("<text>\nsame\n</text>");
  });

  it("reads the selection once when it differs from the clipboard", async () => {
    Clipboard.readText.mockResolvedValue("something else");
    getSelectedText.mockResolvedValue("selected text");
    const api = mockOpenRouter();
    launch();
    await sentText(api);
    expect(getSelectedText).toHaveBeenCalledTimes(1);
  });

  it("uses text passed by a deeplink without reading the selection", async () => {
    const api = mockOpenRouter();
    launch({ text: "from a script" });
    expect(await sentText(api)).toBe("<text>\nfrom a script\n</text>");
    expect(getSelectedText).not.toHaveBeenCalled();
  });

  it.each([{ text: "   " }, { text: 42 }, {}])(
    "ignores unusable deeplink context %j and reads the selection",
    async (context) => {
      getSelectedText.mockResolvedValue("selected");
      const api = mockOpenRouter();
      launch(context);
      expect(await sentText(api)).toBe("<text>\nselected\n</text>");
    },
  );
});

describe("Choose Model command", () => {
  it("shows the model list", async () => {
    mockOpenRouter({ models: [model("openai/gpt-6-luna")] });
    render(<ChooseModel />);
    await waitFor(() => expect(screen.getAllByRole("listitem").length).toBeGreaterThan(0));
    expect(screen.getByTestId("list").dataset.title).toBe("Choose Model · newest first");
  });
});

describe("Edit Prompt command", () => {
  it("shows the prompt form", async () => {
    render(<EditPrompt />);
    await waitFor(() => expect(screen.getByLabelText<HTMLTextAreaElement>("Prompt").value).toBe(DEFAULT_PROMPT));
    expect(screen.getByTestId("form").dataset.title).toBe("Edit Prompt");
  });
});
