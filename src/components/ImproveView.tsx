import {
  Action,
  ActionPanel,
  getPreferenceValues,
  Icon,
  Keyboard,
  List,
  openExtensionPreferences,
  useNavigation,
} from "@raycast/api";
import { showFailureToast } from "@raycast/utils";
import { useEffect, useMemo, useRef, useState } from "react";
import { followUpHistory, generateTurn, turnPreview, TurnState } from "../lib/improve";
import { renderText } from "../lib/preview";
import { Preset, PRESETS, presetInstruction } from "../lib/presets";
import { splitSelection, Turn } from "../lib/prompt";
import { ModelList } from "./ModelList";
import { PromptForm } from "./PromptForm";

const turnId = (index: number) => `turn-${index}`;

export function ImproveView({ original }: { original: string }) {
  const { apiKey, reasoningEffort } = getPreferenceValues<Preferences>();
  const { pop } = useNavigation();
  const { lead, body, trail } = useMemo(() => splitSelection(original), [original]);
  const [turns, setTurns] = useState<Turn[]>([{ reply: "", status: "streaming" }]);
  const [input, setInput] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const diffCache = useRef(new WeakMap<Turn, string>());

  async function generate(history: Turn[], instruction?: string, title?: string) {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const show = (state: TurnState) => {
      if (abortRef.current === controller) setTurns([...history, { instruction, title, ...state }]);
    };
    show({ reply: "", status: "streaming" });
    const final = await generateTurn({
      apiKey,
      effort: reasoningEffort,
      text: body,
      history,
      instruction,
      signal: controller.signal,
      onUpdate: show,
    });
    show(final);
    if (final.status === "failed") await showFailureToast(final.error, { title: "Couldn't improve the text" });
  }

  useEffect(() => {
    generate([]);
    return () => abortRef.current?.abort();
  }, []);

  const last = turns[turns.length - 1];
  const streaming = last.status === "streaming";

  const regenerate = () => generate(turns.slice(0, -1), last.instruction, last.title);

  const sendFollowUp = () => {
    const instruction = input.trim();
    if (!instruction) return;
    setInput("");
    generate(followUpHistory(turns), instruction);
  };

  const sendPreset = async (preset: Preset) =>
    generate(followUpHistory(turns), await presetInstruction(preset), preset.title);

  // Finished turns keep their object identity, so each diff is computed once instead of on every stream flush.
  const preview = (turn: Turn) => {
    if (turn.status === "streaming") return turnPreview(turn, body);
    let markdown = diffCache.current.get(turn);
    if (markdown === undefined) {
      markdown = turnPreview(turn, body);
      diffCache.current.set(turn, markdown);
    }
    return markdown;
  };
  const originalPreview = useMemo(() => renderText(body), [body]);

  const actions = (response: string) => (
    <ActionPanel>
      <ActionPanel.Section>
        {streaming && <Action title="Stop Generating" icon={Icon.Stop} onAction={() => abortRef.current?.abort()} />}
        {!streaming && input.trim() && <Action title="Send Follow-Up" icon={Icon.Message} onAction={sendFollowUp} />}
        {!streaming && response && (
          <>
            <Action.Paste title="Paste Response" content={`${lead}${response}${trail}`} />
            <Action.CopyToClipboard
              title="Copy Response"
              content={`${lead}${response}${trail}`}
              shortcut={Keyboard.Shortcut.Common.Copy}
            />
          </>
        )}
      </ActionPanel.Section>
      <ActionPanel.Section>
        <Action
          title="Regenerate"
          icon={Icon.ArrowClockwise}
          shortcut={Keyboard.Shortcut.Common.Refresh}
          onAction={regenerate}
        />
        <Action.Push
          title="Change Model…"
          icon={Icon.ComputerChip}
          shortcut={{ modifiers: ["cmd"], key: "m" }}
          target={
            <ModelList
              onPick={() => {
                pop();
                regenerate();
              }}
            />
          }
        />
        <Action.Push
          title="Edit Prompt…"
          icon={Icon.Text}
          shortcut={Keyboard.Shortcut.Common.Edit}
          target={
            <PromptForm
              onSaved={() => {
                pop();
                regenerate();
              }}
            />
          }
        />
        <Action.CopyToClipboard title="Copy Original" content={original} />
        <Action title="Open Extension Preferences" icon={Icon.Gear} onAction={openExtensionPreferences} />
      </ActionPanel.Section>
      {!streaming && (
        <ActionPanel.Section title="Follow-Ups">
          {PRESETS.map((preset) => (
            <Action
              key={preset.title}
              title={preset.title}
              icon={preset.icon}
              shortcut={{ modifiers: ["cmd"], key: preset.key }}
              onAction={() => sendPreset(preset)}
            />
          ))}
        </ActionPanel.Section>
      )}
    </ActionPanel>
  );

  return (
    <List
      isShowingDetail
      filtering={false}
      isLoading={streaming}
      navigationTitle="Improve Writing"
      searchText={input}
      onSearchTextChange={setInput}
      searchBarPlaceholder="Ask for changes, e.g. more casual, and press ↵"
      selectedItemId={turnId(turns.length - 1)}
    >
      {turns
        .map((turn, i) => (
          <List.Item
            key={turnId(i)}
            id={turnId(i)}
            icon={turn.instruction ? Icon.Message : Icon.Wand}
            title={turn.title ?? turn.instruction ?? "Improved"}
            accessories={turn.status === "streaming" ? [{ tag: "writing…" }] : undefined}
            detail={<List.Item.Detail markdown={preview(turn)} />}
            actions={actions(turn.status === "done" ? turn.reply : "")}
          />
        ))
        .reverse()}
      <List.Item
        id="original"
        icon={Icon.Document}
        title="Original"
        detail={<List.Item.Detail markdown={originalPreview} />}
        actions={actions("")}
      />
    </List>
  );
}
