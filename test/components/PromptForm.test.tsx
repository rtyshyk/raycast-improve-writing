import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PromptForm } from "../../src/components/PromptForm";
import { DEFAULT_PROMPT, OUTPUT_CONTRACT } from "../../src/lib/prompt";
import { LocalStorage, showHUD } from "../mocks/raycast-api";

const textarea = () => screen.getByLabelText<HTMLTextAreaElement>("Prompt");
const click = (name: string) => fireEvent.click(screen.getByRole("button", { name }));

describe("PromptForm", () => {
  it("shows the default prompt when none is saved", async () => {
    render(<PromptForm />);
    await waitFor(() => expect(textarea().value).toBe(DEFAULT_PROMPT));
  });

  it("loads the saved prompt", async () => {
    await LocalStorage.setItem("prompt", "Be brief.");
    render(<PromptForm />);
    await waitFor(() => expect(textarea().value).toBe("Be brief."));
  });

  it("shows the output rule that is always added", () => {
    render(<PromptForm />);
    expect(screen.getByText(OUTPUT_CONTRACT)).toBeTruthy();
  });

  it("saves the edited prompt and confirms with a HUD", async () => {
    render(<PromptForm />);
    await waitFor(() => expect(textarea().value).toBe(DEFAULT_PROMPT));
    fireEvent.change(textarea(), { target: { value: "  Use British spelling.  " } });
    click("Save Prompt");
    await waitFor(() => expect(showHUD).toHaveBeenCalledWith("Prompt saved"));
    expect(await LocalStorage.getItem("prompt")).toBe("Use British spelling.");
  });

  it("calls onSaved instead of showing a HUD when pushed from the result view", async () => {
    const onSaved = vi.fn();
    render(<PromptForm onSaved={onSaved} />);
    await waitFor(() => expect(textarea().value).toBe(DEFAULT_PROMPT));
    fireEvent.change(textarea(), { target: { value: "Shorter sentences." } });
    click("Save Prompt");
    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
    expect(showHUD).not.toHaveBeenCalled();
    expect(await LocalStorage.getItem("prompt")).toBe("Shorter sentences.");
  });

  it("Reset to Default restores the default text, and saving it clears the custom prompt", async () => {
    await LocalStorage.setItem("prompt", "Custom.");
    render(<PromptForm />);
    await waitFor(() => expect(textarea().value).toBe("Custom."));
    click("Reset to Default");
    expect(textarea().value).toBe(DEFAULT_PROMPT);
    click("Save Prompt");
    await waitFor(() => expect(showHUD).toHaveBeenCalled());
    expect(await LocalStorage.getItem("prompt")).toBeUndefined();
  });

  it("saving an empty prompt goes back to the default", async () => {
    await LocalStorage.setItem("prompt", "Custom.");
    render(<PromptForm />);
    await waitFor(() => expect(textarea().value).toBe("Custom."));
    fireEvent.change(textarea(), { target: { value: "" } });
    click("Save Prompt");
    await waitFor(() => expect(showHUD).toHaveBeenCalled());
    expect(await LocalStorage.getItem("prompt")).toBeUndefined();
  });

  it("ignores Save until the saved prompt has loaded", async () => {
    LocalStorage.getItem.mockImplementationOnce(() => new Promise(() => {}));
    render(<PromptForm />);
    expect(screen.getByTestId("form").dataset.loading).toBe("true");
    click("Save Prompt");
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(LocalStorage.setItem).not.toHaveBeenCalled();
    expect(LocalStorage.removeItem).not.toHaveBeenCalled();
    expect(showHUD).not.toHaveBeenCalled();
  });
});
