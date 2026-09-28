import { Action, ActionPanel, Icon, Keyboard, List } from "@raycast/api";
import { useCachedState, usePromise } from "@raycast/utils";
import { useMemo, useState } from "react";
import { getActiveModel, resetActiveModel, setActiveModel } from "../lib/model";
import {
  countProviders,
  displayName,
  formatAge,
  formatContext,
  formatPrice,
  isStale,
  ModelCache,
  providerOf,
  Sort,
  sortModels,
} from "../lib/model-catalog";
import { fetchModels, OpenRouterModel } from "../lib/openrouter";

const contextTag = (tokens: number) => (tokens ? [{ tag: formatContext(tokens), tooltip: "Context window" }] : []);

// Opened from the result view; picking or resetting saves the choice and hands back to it.
export function ModelList({ onPick }: { onPick: () => void }) {
  const [sort, setSort] = useState<Sort>("newest");
  const [providerFilter, setProviderFilter] = useState("all");
  // usePromise reports isLoading only while `execute` is true, which a fresh cache turns off.
  const [reloading, setReloading] = useState(false);
  const { data: active } = usePromise(getActiveModel);
  // Persisted across launches; refetched once a day or on ⌘R.
  const [cache, setCache] = useCachedState<ModelCache>("models", {
    fetchedAt: 0,
    models: [],
  });
  const { models, fetchedAt } = cache;
  const { isLoading, revalidate: reloadModels } = usePromise(fetchModels, [], {
    execute: isStale(cache),
    onData: (fresh) => setCache({ fetchedAt: Date.now(), models: fresh }),
    failureToastOptions: { title: "Couldn't load OpenRouter models" },
  });

  const providers = useMemo(() => countProviders(models), [models]);
  const visible = useMemo(() => sortModels(models, sort, providerFilter), [models, sort, providerFilter]);

  const current = visible.find((m) => m.id === active);

  async function reload() {
    setReloading(true);
    await reloadModels();
    setReloading(false);
  }

  async function pick(id: string) {
    await setActiveModel(id);
    onPick();
  }

  async function reset() {
    await resetActiveModel();
    onPick();
  }

  const item = (model: OpenRouterModel) => (
    <List.Item
      key={model.id}
      title={displayName(model)}
      subtitle={model.id}
      keywords={[model.id, providerOf(model.id)]}
      icon={model.id === active ? Icon.CheckCircle : Icon.Circle}
      accessories={[
        {
          text: `in ${formatPrice(model.pricing.prompt)} · out ${formatPrice(model.pricing.completion)}`,
          tooltip: "USD per 1M tokens",
        },
        ...contextTag(model.context_length),
      ]}
      actions={
        <ActionPanel>
          <Action title="Use Model" icon={Icon.Checkmark} onAction={() => pick(model.id)} />
          <Action.CopyToClipboard title="Copy Model ID" content={model.id} shortcut={Keyboard.Shortcut.Common.Copy} />
          <Action.OpenInBrowser
            title="Open on OpenRouter"
            url={`https://openrouter.ai/${model.id}`}
            shortcut={Keyboard.Shortcut.Common.Open}
          />
          <Action
            title={sort === "newest" ? "Sort by Price" : "Sort by Newest"}
            icon={Icon.ArrowUp}
            shortcut={{ modifiers: ["cmd", "shift"], key: "p" }}
            onAction={() => setSort(sort === "newest" ? "cheapest" : "newest")}
          />
          <Action
            title="Reload Models"
            icon={Icon.ArrowClockwise}
            shortcut={Keyboard.Shortcut.Common.Refresh}
            onAction={reload}
          />
          <Action
            title="Reset to Preference Default"
            icon={Icon.ArrowCounterClockwise}
            shortcut={{ modifiers: ["cmd", "shift"], key: "r" }}
            onAction={reset}
          />
        </ActionPanel>
      }
    />
  );

  return (
    <List
      isLoading={isLoading || reloading}
      navigationTitle="Choose Model"
      searchBarPlaceholder="Search OpenRouter models…"
      searchBarAccessory={
        <List.Dropdown tooltip="Provider" value={providerFilter} onChange={setProviderFilter}>
          <List.Dropdown.Item title="All Providers" value="all" />
          <List.Dropdown.Section>
            {providers.map(([name, count]) => (
              <List.Dropdown.Item key={name} title={`${name} (${count})`} value={name} />
            ))}
          </List.Dropdown.Section>
        </List.Dropdown>
      }
    >
      {current && <List.Section title="Current">{item(current)}</List.Section>}
      <List.Section
        title="Models"
        subtitle={`${visible.length} · ${sort === "newest" ? "newest" : "cheapest"} first · in/out per 1M tokens${fetchedAt ? ` · updated ${formatAge(Date.now() - fetchedAt)}` : ""}`}
      >
        {visible.map(item)}
      </List.Section>
    </List>
  );
}
