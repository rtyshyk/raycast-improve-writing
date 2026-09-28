import { OpenRouterModel } from "./openrouter";

export type Sort = "newest" | "cheapest";

export type ModelCache = { fetchedAt: number; models: OpenRouterModel[] };

export const MAX_AGE_MS = 24 * 60 * 60 * 1000;

export const isStale = ({ fetchedAt, models }: ModelCache, now = Date.now()) =>
  models.length === 0 || now - fetchedAt > MAX_AGE_MS;

export function formatAge(ms: number) {
  const minutes = Math.round(ms / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  return hours < 24 ? `${hours}h ago` : `${Math.round(hours / 24)}d ago`;
}

const usd = (maximumFractionDigits: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits,
  });

const USD2 = usd(2);
const USD3 = usd(3);
const COMPACT = new Intl.NumberFormat("en-US", { notation: "compact" });

// OpenRouter prices are USD per token as strings; "-1" marks routers whose price depends on the routed model.
export function formatPrice(perToken: string) {
  const value = Number(perToken);
  if (!Number.isFinite(value) || value < 0) return "variable";
  if (value === 0) return "free";
  const perMillion = value * 1e6;
  return (perMillion < 1 ? USD3 : USD2).format(perMillion);
}

export const formatContext = (tokens: number) => (tokens ? COMPACT.format(tokens) : "");

export const providerOf = (id: string) => id.split("/")[0];

export const displayName = (model: OpenRouterModel) => model.name.replace(/^[^:]+:\s*/, "");

const totalPrice = (model: OpenRouterModel) => {
  const total = Number(model.pricing.prompt) + Number(model.pricing.completion);
  return total < 0 || !Number.isFinite(total) ? Infinity : total;
};

export function countProviders(models: OpenRouterModel[]) {
  const counts = new Map<string, number>();
  models.forEach((m) => counts.set(providerOf(m.id), (counts.get(providerOf(m.id)) ?? 0) + 1));
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

export function sortModels(models: OpenRouterModel[], sort: Sort, provider = "all") {
  const filtered = provider === "all" ? models : models.filter((m) => providerOf(m.id) === provider);
  return [...filtered].sort((a, b) =>
    sort === "newest" ? b.created - a.created : totalPrice(a) - totalPrice(b) || b.created - a.created,
  );
}
