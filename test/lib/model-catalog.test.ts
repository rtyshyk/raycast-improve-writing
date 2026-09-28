import { describe, expect, it } from "vitest";
import {
  countProviders,
  displayName,
  formatAge,
  formatContext,
  formatPrice,
  isStale,
  MAX_AGE_MS,
  providerOf,
  sortModels,
} from "../../src/lib/model-catalog";
import { model } from "../helpers";

describe("formatPrice", () => {
  it("shows USD per million tokens", () => {
    expect(formatPrice("0.0000001")).toBe("$0.10");
    expect(formatPrice("0.000002")).toBe("$2.00");
    expect(formatPrice("0.00018")).toBe("$180.00");
  });

  it("keeps a third decimal below a dollar", () => {
    expect(formatPrice("0.000000075")).toBe("$0.075");
  });

  it("labels free and variable prices", () => {
    expect(formatPrice("0")).toBe("free");
    expect(formatPrice("-1")).toBe("variable");
    expect(formatPrice("not a number")).toBe("variable");
  });
});

describe("formatContext", () => {
  it("abbreviates token counts", () => {
    expect(formatContext(131072)).toBe("131K");
    expect(formatContext(200000)).toBe("200K");
    expect(formatContext(1050000)).toBe("1.1M");
  });

  it("is empty for an unknown context size", () => {
    expect(formatContext(0)).toBe("");
  });
});

describe("formatAge", () => {
  it("describes how long ago the list was fetched", () => {
    expect(formatAge(10_000)).toBe("just now");
    expect(formatAge(5 * 60_000)).toBe("5m ago");
    expect(formatAge(3 * 3_600_000)).toBe("3h ago");
    expect(formatAge(2 * 86_400_000)).toBe("2d ago");
  });
});

describe("isStale", () => {
  const now = 1_000_000_000_000;

  it("is stale when nothing is cached", () => {
    expect(isStale({ fetchedAt: now, models: [] }, now)).toBe(true);
  });

  it("stays fresh for a day", () => {
    expect(isStale({ fetchedAt: now - MAX_AGE_MS, models: [model("a/b")] }, now)).toBe(false);
    expect(isStale({ fetchedAt: now - MAX_AGE_MS - 1, models: [model("a/b")] }, now)).toBe(true);
  });
});

describe("model names", () => {
  it("reads the provider from the id", () => {
    expect(providerOf("anthropic/claude-sonnet-5")).toBe("anthropic");
  });

  it("drops the provider prefix from the display name", () => {
    expect(displayName(model("openai/x", { name: "OpenAI: GPT-6 Luna" }))).toBe("GPT-6 Luna");
    expect(displayName(model("openai/x", { name: "Plain name" }))).toBe("Plain name");
  });
});

describe("countProviders", () => {
  it("counts models per provider, most first", () => {
    const models = [model("openai/a"), model("anthropic/a"), model("openai/b"), model("google/a"), model("openai/c")];
    expect(countProviders(models)[0]).toEqual(["openai", 3]);
    expect(countProviders(models)).toHaveLength(3);
  });
});

describe("sortModels", () => {
  const models = [
    model("openai/old", { created: 1, pricing: { prompt: "0.000001", completion: "0.000001" } }),
    model("anthropic/new", { created: 3, pricing: { prompt: "0.000005", completion: "0.000005" } }),
    model("openrouter/auto", { created: 4, pricing: { prompt: "-1", completion: "-1" } }),
    model("openai/free", { created: 2, pricing: { prompt: "0", completion: "0" } }),
    model("openai/cheap-new", { created: 5, pricing: { prompt: "0.000001", completion: "0.000001" } }),
  ];
  const ids = (list: typeof models) => list.map((m) => m.id);

  it("sorts newest first", () => {
    expect(ids(sortModels(models, "newest"))).toEqual([
      "openai/cheap-new",
      "openrouter/auto",
      "anthropic/new",
      "openai/free",
      "openai/old",
    ]);
  });

  it("sorts cheapest first, newest among equal prices, variable prices last", () => {
    expect(ids(sortModels(models, "cheapest"))).toEqual([
      "openai/free",
      "openai/cheap-new",
      "openai/old",
      "anthropic/new",
      "openrouter/auto",
    ]);
  });

  it("filters by provider", () => {
    expect(ids(sortModels(models, "newest", "openai"))).toEqual(["openai/cheap-new", "openai/free", "openai/old"]);
  });

  it("does not reorder the input", () => {
    sortModels(models, "cheapest");
    expect(models[0].id).toBe("openai/old");
  });
});
