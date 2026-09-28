// In-memory stand-in for @raycast/api. UI components render plain DOM so tests can query and click them.
import path from "node:path";
import { ReactNode } from "react";
import { vi } from "vitest";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Props = Record<string, any> & { children?: ReactNode };

// ---- environment and preferences

export const LaunchType = { UserInitiated: "userInitiated", Background: "background" };

export const environment = {
  appearance: "dark" as "dark" | "light",
  launchType: LaunchType.UserInitiated,
  extensionName: "improve-writing-openrouter",
  commandName: "improve-writing",
  commandMode: "view",
  supportPath: "/tmp/raycast-test",
  assetsPath: path.resolve("assets"),
  isDevelopment: false,
  raycastVersion: "2.5.2",
};

const DEFAULT_PREFERENCES = { apiKey: "test-key", defaultModel: "openai/gpt-6-luna", reasoningEffort: "low" };
let preferences: Record<string, unknown> = { ...DEFAULT_PREFERENCES };

export const setPreferences = (values: Record<string, unknown>) => {
  preferences = { ...DEFAULT_PREFERENCES, ...values };
};

export const getPreferenceValues = vi.fn(() => preferences);
export const openExtensionPreferences = vi.fn(async () => {});
export const openCommandPreferences = vi.fn(async () => {});

// ---- storage

const storage = new Map<string, string>();

export const LocalStorage = {
  getItem: vi.fn(async (key: string) => storage.get(key)),
  setItem: vi.fn(async (key: string, value: unknown) => void storage.set(key, String(value))),
  removeItem: vi.fn(async (key: string) => void storage.delete(key)),
  allItems: vi.fn(async () => Object.fromEntries(storage)),
  clear: vi.fn(async () => storage.clear()),
};

// Instances share one store per namespace, like Raycast's on-disk cache.
const cacheStores = new Map<string, Map<string, string>>();

export class Cache {
  private store: Map<string, string>;
  private listeners = new Set<(key: string | undefined, data: string | undefined) => void>();
  constructor(options?: { namespace?: string }) {
    const namespace = options?.namespace ?? "";
    if (!cacheStores.has(namespace)) cacheStores.set(namespace, new Map());
    this.store = cacheStores.get(namespace)!;
  }
  // Arrow properties: @raycast/utils passes these around detached (e.g. to useSyncExternalStore).
  get = (key: string) => this.store.get(key);
  has = (key: string) => this.store.has(key);
  set = (key: string, data: string) => {
    this.store.set(key, data);
    this.listeners.forEach((listener) => listener(key, data));
  };
  remove = (key: string) => {
    const existed = this.store.delete(key);
    this.listeners.forEach((listener) => listener(key, undefined));
    return existed;
  };
  clear = () => {
    this.store.clear();
    this.listeners.forEach((listener) => listener(undefined, undefined));
  };
  subscribe = (listener: (key: string | undefined, data: string | undefined) => void) => {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  };
  get isEmpty() {
    return this.store.size === 0;
  }
}

// ---- system

export const getSelectedText = vi.fn(async (): Promise<string> => {
  throw new Error("Cannot copy selected text from frontmost application.");
});

export const Clipboard = {
  copy: vi.fn<(content: unknown) => Promise<void>>(async () => {}),
  paste: vi.fn<(content: unknown) => Promise<void>>(async () => {}),
  clear: vi.fn(async () => {}),
  readText: vi.fn(async (): Promise<string | undefined> => undefined),
  read: vi.fn(async () => ({ text: undefined })),
};

export const Toast = { Style: { Success: "SUCCESS", Failure: "FAILURE", Animated: "ANIMATED" } };
export const showToast = vi.fn(async (options: Record<string, unknown>) => ({ ...options, hide: vi.fn() }));
export const showHUD = vi.fn(async () => {});
export const open = vi.fn<(target: string) => Promise<void>>(async () => {});
export const closeMainWindow = vi.fn(async () => {});
export const popToRoot = vi.fn(async () => {});
export const launchCommand = vi.fn(async () => {});

export const navigation = { push: vi.fn(), pop: vi.fn() };
export const useNavigation = () => navigation;

// ---- constants used as plain values

const names = () => new Proxy({}, { get: (_target, name) => String(name) });
export const Icon: Record<string, string> = names();
export const Color: Record<string, string> = names();
export const Image = { Mask: names() };
export const Keyboard = {
  Shortcut: {
    Common: new Proxy({}, { get: (_target, name) => ({ modifiers: ["cmd"], key: String(name) }) }),
  },
};
export const AI = { ask: vi.fn(), Model: names(), Creativity: names() };
export const OAuth = { PKCEClient: class {}, RedirectMethod: names() };

export type LaunchProps<T extends { launchContext?: unknown } = { launchContext?: unknown }> = {
  launchContext?: T["launchContext"];
  arguments: Record<string, string>;
  fallbackText?: string;
};

// ---- UI components

function ActionButton({ title, content, run }: { title: string; content?: unknown; run: () => unknown }) {
  return (
    <button
      type="button"
      data-action={title}
      data-content={content === undefined ? undefined : String(content)}
      onClick={run}
    >
      {title}
    </button>
  );
}

export function Action({ title, onAction }: Props) {
  return <ActionButton title={title} run={() => onAction?.()} />;
}
Action.Paste = ({ title = "Paste in Active App", content, onPaste }: Props) => (
  <ActionButton
    title={title}
    content={content}
    run={async () => {
      await Clipboard.paste(content);
      onPaste?.(content);
    }}
  />
);
Action.CopyToClipboard = ({ title = "Copy to Clipboard", content, onCopy }: Props) => (
  <ActionButton
    title={title}
    content={content}
    run={async () => {
      await Clipboard.copy(content);
      onCopy?.(content);
    }}
  />
);
Action.Push = ({ title, target }: Props) => <ActionButton title={title} run={() => navigation.push(target)} />;
Action.OpenInBrowser = ({ title = "Open in Browser", url }: Props) => (
  <ActionButton title={title} content={url} run={() => open(url)} />
);
Action.SubmitForm = ({ title = "Submit Form", onSubmit }: Props) => (
  <ActionButton title={title} run={() => onSubmit?.({})} />
);

export function ActionPanel({ children }: Props) {
  return <div data-testid="action-panel">{children}</div>;
}
ActionPanel.Section = ({ children, title }: Props) => <div data-section={title ?? ""}>{children}</div>;
ActionPanel.Submenu = ({ children, title }: Props) => <div data-submenu={title}>{children}</div>;

export function List({
  children,
  isLoading,
  navigationTitle,
  searchText,
  onSearchTextChange,
  searchBarPlaceholder,
  searchBarAccessory,
  selectedItemId,
}: Props) {
  return (
    <div
      data-testid="list"
      data-loading={String(Boolean(isLoading))}
      data-title={navigationTitle ?? ""}
      data-selected={selectedItemId ?? ""}
    >
      <input
        aria-label="Search"
        placeholder={searchBarPlaceholder}
        value={searchText}
        onChange={(event) => onSearchTextChange?.(event.target.value)}
      />
      {searchBarAccessory}
      {children}
    </div>
  );
}

function ListItem({ id, title, subtitle, icon, accessories, detail, actions }: Props) {
  return (
    <div role="listitem" aria-label={title} data-id={id ?? ""} data-icon={icon === undefined ? "" : String(icon)}>
      <span data-part="title">{title}</span>
      {subtitle && <span data-part="subtitle">{subtitle}</span>}
      {(accessories ?? []).map((accessory: Props, i: number) => (
        <span key={i} data-part="accessory" data-tooltip={accessory.tooltip ?? ""}>
          {accessory.text ?? accessory.tag}
        </span>
      ))}
      {detail}
      {actions}
    </div>
  );
}
ListItem.Detail = ({ markdown, metadata }: Props) => (
  <div data-testid="item-detail" data-markdown={markdown ?? ""}>
    {metadata}
  </div>
);
List.Item = ListItem;
List.Section = ({ children, title, subtitle }: Props) => (
  <section aria-label={title} data-subtitle={subtitle ?? ""}>
    {children}
  </section>
);
function ListDropdown({ children, tooltip, value, onChange }: Props) {
  return (
    <select aria-label={tooltip} value={value} onChange={(event) => onChange?.(event.target.value)}>
      {children}
    </select>
  );
}
ListDropdown.Item = ({ title, value }: Props) => <option value={value}>{title}</option>;
ListDropdown.Section = ({ children, title }: Props) => <optgroup label={title ?? ""}>{children}</optgroup>;
List.Dropdown = ListDropdown;
List.EmptyView = ({ title }: Props) => <div data-testid="empty-view">{title}</div>;

export function Detail({ markdown, isLoading, actions }: Props) {
  return (
    <div data-testid="detail" data-loading={String(Boolean(isLoading))} data-markdown={markdown ?? ""}>
      {actions}
    </div>
  );
}

export function Form({ children, actions, isLoading, navigationTitle }: Props) {
  return (
    <form data-testid="form" data-loading={String(Boolean(isLoading))} data-title={navigationTitle ?? ""}>
      {children}
      {actions}
    </form>
  );
}
Form.TextArea = ({ id, title, value, placeholder, onChange }: Props) => (
  <textarea
    aria-label={title}
    name={id}
    placeholder={placeholder}
    value={value}
    onChange={(event) => onChange?.(event.target.value)}
  />
);
Form.Description = ({ title, text }: Props) => <p data-title={title ?? ""}>{text}</p>;

export const MenuBarExtra = ({ children }: Props) => <div>{children}</div>;

// ---- test control

export function resetRaycastMock() {
  storage.clear();
  cacheStores.forEach((store) => store.clear());
  preferences = { ...DEFAULT_PREFERENCES };
  environment.appearance = "dark";
  // mockReset also drops queued once-values, so a test can't leak them into the next one.
  getSelectedText.mockReset().mockImplementation(async () => {
    throw new Error("Cannot copy selected text from frontmost application.");
  });
  Clipboard.readText.mockReset().mockImplementation(async () => undefined);
  LocalStorage.getItem.mockReset().mockImplementation(async (key: string) => storage.get(key));
}
