import { Action, ActionPanel, Form, Icon, showHUD } from "@raycast/api";
import { usePromise } from "@raycast/utils";
import { useState } from "react";
import { DEFAULT_PROMPT, getPrompt, OUTPUT_CONTRACT, savePrompt } from "../lib/prompt";

export function PromptForm({ onSaved }: { onSaved?: () => void }) {
  const { data: saved, isLoading } = usePromise(getPrompt);
  const [draft, setDraft] = useState<string>();
  const prompt = draft ?? saved ?? "";

  async function save() {
    if (isLoading) return;
    await savePrompt(prompt);
    if (onSaved) onSaved();
    else await showHUD("Prompt saved");
  }

  return (
    <Form
      isLoading={isLoading}
      navigationTitle="Edit Prompt"
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Save Prompt" icon={Icon.Check} onSubmit={save} />
          <Action
            title="Reset to Default"
            icon={Icon.ArrowCounterClockwise}
            shortcut={{ modifiers: ["cmd", "shift"], key: "r" }}
            onAction={() => setDraft(DEFAULT_PROMPT)}
          />
        </ActionPanel>
      }
    >
      <Form.TextArea
        id="prompt"
        title="Prompt"
        placeholder={DEFAULT_PROMPT}
        value={prompt}
        onChange={setDraft}
        enableMarkdown={false}
        autoFocus
      />
      <Form.Description title="Always added" text={OUTPUT_CONTRACT} />
      <Form.Description text="⌘↵ saves · ⌘⇧R restores the default · an empty prompt uses the default" />
    </Form>
  );
}
