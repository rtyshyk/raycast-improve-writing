import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import ImproveWriting from "../src/improve-writing";
import { mockOpenRouter } from "./helpers";
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
    // Store rule: a command's root view keeps Raycast's own title.
    expect(screen.getByTestId("list").dataset.title).toBe("");
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
