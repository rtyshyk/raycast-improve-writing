# Improve Writing (OpenRouter)

A Raycast 2 extension that works like Raycast AI's "Improve Writing", but runs on any OpenRouter model with your own key.

Select text in any app and run **Improve Writing**. The result streams in, then shows the changes highlighted against your selection: green for added text, red and struck through for removed text. Press ↵ to paste it over the selection.

Type a follow-up in the search bar (e.g. "more casual", "shorter", "translate to Ukrainian") and press ↵ to revise the result. Each version stays in the list on the left, so ↑/↓ and ↵ paste an earlier one.

## Install

```sh
npm install
npm run dev   # imports the extension into Raycast; it stays after you stop the dev server
```

Raycast asks for your OpenRouter API key on first run (https://openrouter.ai/keys). Assign a hotkey to **Improve Writing** in Raycast Settings → Extensions.

## Shortcuts

| Key | Action                                                          |
| --- | --------------------------------------------------------------- |
| ↵   | Paste Response, or Send Follow-up when the search bar has text  |
| ⌘⇧C | Copy Response                                                   |
| ⌘R  | Regenerate                                                      |
| ⌘M  | Change Model… (the pick is saved, then the text is regenerated) |
| ⌘E  | Edit Prompt… (save, then the text is regenerated)               |

A script can pass the text directly instead of the selection: `raycast://extensions/roman.tyshyk/improve-writing-openrouter/improve-writing?context={"text":"…"}` (URL-encoded).

## Settings

- **Default Model**: an OpenRouter model id, `openai/gpt-6-luna` by default. A model picked with ⌘M overrides it until you choose "Reset to Preference Default" (⌘⇧R) in the model list.
- **Prompt**: edit it with ⌘E in the result view. It is a multi-line form, because Raycast preferences have no text area. ⌘⇧R restores the default, and an empty prompt also uses the default. The code always adds a fixed output rule on top, so edits to the prompt can't break pasting.
- **Reasoning Effort**: for reasoning models. `low` by default; `none` is fastest.

## Changing the model

⌘M in the result view lists every OpenRouter chat model, newest first. `:batch` variants are hidden. The list is cached for a day and opens instantly; ⌘R reloads it.

- Each row shows the input and output price per 1M tokens and the context size.
- The search bar dropdown filters by provider, and ⌘⇧P switches to sorting by price.

Developing, CI and publishing: see [CONTRIBUTING.md](CONTRIBUTING.md).
