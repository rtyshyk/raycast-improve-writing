import { describe, expect, it } from "vitest";
import { getActiveModel, resetActiveModel, setActiveModel } from "../../src/lib/model";
import { LocalStorage, setPreferences } from "../mocks/raycast-api";

describe("active model", () => {
  it("falls back to the trimmed default-model preference", async () => {
    setPreferences({ defaultModel: "  anthropic/claude-sonnet-5 " });
    expect(await getActiveModel()).toBe("anthropic/claude-sonnet-5");
  });

  it("uses the picked model over the preference", async () => {
    await setActiveModel("openai/gpt-6-sol");
    expect(await LocalStorage.getItem("activeModel")).toBe("openai/gpt-6-sol");
    expect(await getActiveModel()).toBe("openai/gpt-6-sol");
  });

  it("reset goes back to the preference", async () => {
    await setActiveModel("openai/gpt-6-sol");
    await resetActiveModel();
    expect(await LocalStorage.getItem("activeModel")).toBeUndefined();
    expect(await getActiveModel()).toBe("openai/gpt-6-luna");
  });
});
