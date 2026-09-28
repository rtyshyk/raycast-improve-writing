import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ModelList } from "../../src/components/ModelList";
import { MAX_AGE_MS } from "../../src/lib/model-catalog";
import { mockOpenRouter, model } from "../helpers";
import { LocalStorage, showToast } from "../mocks/raycast-api";

const MODELS = [
  model("openai/gpt-6-luna", {
    name: "OpenAI: GPT-6 Luna",
    created: 30,
    context_length: 1_050_000,
    pricing: { prompt: "0.0000001", completion: "0.0000005" },
  }),
  model("anthropic/claude-sonnet-5", {
    name: "Anthropic: Claude Sonnet 5",
    created: 20,
    context_length: 200_000,
    pricing: { prompt: "0.000002", completion: "0.00001" },
  }),
  model("stealth/free-alpha", {
    name: "Free Alpha",
    created: 40,
    context_length: 0,
    pricing: { prompt: "0", completion: "0" },
  }),
  model("openai/gpt-5.5", {
    name: "OpenAI: GPT-5.5",
    created: 10,
    pricing: { prompt: "0.000005", completion: "0.00003" },
  }),
];

const modelsSection = () => screen.getByRole("region", { name: "Models" });
const rows = () => within(modelsSection()).queryAllByRole("listitem");
const ids = () => rows().map((row) => row.querySelector('[data-part="subtitle"]')!.textContent);
const row = (id: string) => rows().find((r) => r.querySelector('[data-part="subtitle"]')!.textContent === id)!;
const clickAction = (container: HTMLElement, name: string) =>
  fireEvent.click(within(container).getByRole("button", { name }));

async function open(onPick = vi.fn()) {
  const view = render(<ModelList onPick={onPick} />);
  await waitFor(() => expect(rows()).toHaveLength(MODELS.length));
  return { ...view, onPick };
}

describe("ModelList", () => {
  it("lists the fetched models newest first with name, id, prices and context size", async () => {
    mockOpenRouter({ models: MODELS });
    await open();
    expect(ids()).toEqual(["stealth/free-alpha", "openai/gpt-6-luna", "anthropic/claude-sonnet-5", "openai/gpt-5.5"]);
    const luna = row("openai/gpt-6-luna");
    expect(luna.querySelector('[data-part="title"]')!.textContent).toBe("GPT-6 Luna");
    const accessories = [...luna.querySelectorAll('[data-part="accessory"]')].map((a) => a.textContent);
    expect(accessories).toEqual(["in $0.10 · out $0.50", "1.1M"]);
  });

  it("labels free models and omits an unknown context size", async () => {
    mockOpenRouter({ models: MODELS });
    await open();
    const accessories = [...row("stealth/free-alpha").querySelectorAll('[data-part="accessory"]')];
    expect(accessories.map((a) => a.textContent)).toEqual(["in free · out free"]);
  });

  it("marks the active model and repeats it in a Current section", async () => {
    await LocalStorage.setItem("activeModel", "anthropic/claude-sonnet-5");
    mockOpenRouter({ models: MODELS });
    await open();
    await waitFor(() => expect(row("anthropic/claude-sonnet-5").dataset.icon).toBe("CheckCircle"));
    expect(row("openai/gpt-6-luna").dataset.icon).toBe("Circle");
    const current = within(screen.getByRole("region", { name: "Current" })).getAllByRole("listitem");
    expect(current.map((r) => r.getAttribute("aria-label"))).toEqual(["Claude Sonnet 5"]);
  });

  it("falls back to the default-model preference as the active model", async () => {
    mockOpenRouter({ models: MODELS });
    await open();
    await waitFor(() => expect(row("openai/gpt-6-luna").dataset.icon).toBe("CheckCircle"));
  });

  it("filters by provider from the dropdown, which lists providers by count", async () => {
    mockOpenRouter({ models: MODELS });
    await open();
    const dropdown = screen.getByLabelText<HTMLSelectElement>("Provider");
    expect([...dropdown.options].map((o) => o.textContent)).toEqual([
      "All Providers",
      "openai (2)",
      "anthropic (1)",
      "stealth (1)",
    ]);
    fireEvent.change(dropdown, { target: { value: "openai" } });
    expect(ids()).toEqual(["openai/gpt-6-luna", "openai/gpt-5.5"]);
  });

  it("toggles between newest-first and cheapest-first", async () => {
    mockOpenRouter({ models: MODELS });
    await open();
    expect(screen.getByTestId("list").dataset.title).toBe("Choose Model");
    expect(modelsSection().dataset.subtitle).toMatch(/^4 · newest first · /);
    clickAction(row("openai/gpt-6-luna"), "Sort by Price");
    expect(ids()).toEqual(["stealth/free-alpha", "openai/gpt-6-luna", "anthropic/claude-sonnet-5", "openai/gpt-5.5"]);
    expect(modelsSection().dataset.subtitle).toMatch(/^4 · cheapest first · /);
    clickAction(row("openai/gpt-6-luna"), "Sort by Newest");
    expect(modelsSection().dataset.subtitle).toMatch(/^4 · newest first · /);
  });
  it("Use Model saves the pick and hands back to the result view", async () => {
    mockOpenRouter({ models: MODELS });
    const { onPick } = await open();
    clickAction(row("anthropic/claude-sonnet-5"), "Use Model");
    await waitFor(() => expect(onPick).toHaveBeenCalledOnce());
    expect(await LocalStorage.getItem("activeModel")).toBe("anthropic/claude-sonnet-5");
    expect(showToast).not.toHaveBeenCalled();
  });
  it("Reset to Preference Default clears the pick and hands back", async () => {
    await LocalStorage.setItem("activeModel", "openai/gpt-5.5");
    mockOpenRouter({ models: MODELS });
    const { onPick } = await open();
    clickAction(row("openai/gpt-5.5"), "Reset to Preference Default");
    await waitFor(() => expect(onPick).toHaveBeenCalledOnce());
    expect(await LocalStorage.getItem("activeModel")).toBeUndefined();
  });
  it("copies the model id and links to its OpenRouter page", async () => {
    mockOpenRouter({ models: MODELS });
    await open();
    const actions = within(row("openai/gpt-6-luna"));
    expect(actions.getByRole("button", { name: "Copy Model ID" }).dataset.content).toBe("openai/gpt-6-luna");
    expect(actions.getByRole("button", { name: "Open on OpenRouter" }).dataset.content).toBe(
      "https://openrouter.ai/openai/gpt-6-luna",
    );
  });
});

describe("ModelList cache", () => {
  it("reuses a fresh cached list on the next open instead of refetching", async () => {
    const api = mockOpenRouter({ models: MODELS });
    const first = await open();
    expect(api.modelCalls()).toHaveLength(1);
    expect(modelsSection().dataset.subtitle).toBe("4 · newest first · in/out per 1M tokens · updated just now");
    first.unmount();

    await open();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(api.modelCalls()).toHaveLength(1);
    expect(screen.getByTestId("list").dataset.loading).toBe("false");
  });

  it("refetches once the cached list is older than a day", async () => {
    const api = mockOpenRouter({ models: MODELS });
    (await open()).unmount();
    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now + MAX_AGE_MS + 60_000);
    await open();
    await waitFor(() => expect(api.modelCalls()).toHaveLength(2));
  });

  it("Reload Models refetches a fresh list and shows loading meanwhile", async () => {
    const api = mockOpenRouter({ models: MODELS });
    (await open()).unmount();
    await open();
    let release!: () => void;
    api.fetchMock.mockImplementationOnce(
      () => new Promise<Response>((resolve) => (release = () => resolve(Response.json({ data: MODELS.slice(0, 1) })))),
    );
    clickAction(row("openai/gpt-6-luna"), "Reload Models");
    await waitFor(() => expect(screen.getByTestId("list").dataset.loading).toBe("true"));
    release();
    await waitFor(() => expect(rows()).toHaveLength(1));
    expect(screen.getByTestId("list").dataset.loading).toBe("false");
  });

  it("shows a failure toast when the list can't be loaded", async () => {
    mockOpenRouter({ modelsStatus: 503 });
    render(<ModelList onPick={vi.fn()} />);
    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith(expect.objectContaining({ title: "Couldn't load OpenRouter models" })),
    );
    expect(rows()).toHaveLength(0);
  });
});
