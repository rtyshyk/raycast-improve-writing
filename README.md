# Improve Writing (OpenRouter)

Improve the selected text with any [OpenRouter](https://openrouter.ai) model and your own API key, see every change highlighted, and refine it with follow-ups before you paste.

Select text in any app and run **Improve Writing**. The result streams in, then shows the changes highlighted against your selection: green for added text, red and struck through for removed text. Press ↵ to paste it over the selection.

Type a follow-up in the search bar (e.g. "more casual", "shorter", "translate to Ukrainian") and press ↵ to revise the result, or pick a preset with ⌘1…⌘6. Each version stays in the list on the left, so ↑/↓ and ↵ paste an earlier one.

## Setup

1. Create an API key on the [OpenRouter Keys page](https://openrouter.ai/keys).
2. Run **Improve Writing** and paste the key when Raycast asks for it. Raycast keeps it in its encrypted local storage.
3. Optionally, assign a hotkey to **Improve Writing** in Raycast Settings → Extensions.

The text you improve is sent to OpenRouter and the model's provider. Requests are billed to your OpenRouter account at the model's price, shown in the model list (⌘M).

## Shortcuts

| Key | Action                                                          |
| --- | --------------------------------------------------------------- |
| ↵   | Paste Response, or Send Follow-up when the search bar has text  |
| ⌘⇧C | Copy Response                                                   |
| ⌘R  | Regenerate                                                      |
| ⌘M  | Change Model… (the pick is saved, then the text is regenerated) |
| ⌘E  | Edit Prompt… (save, then the text is regenerated)               |
| ⌘1  | Shorter                                                         |
| ⌘2  | More Formal                                                     |
| ⌘3  | More Casual                                                     |
| ⌘4  | Fix Grammar Only (back to the original, no rewording)           |
| ⌘5  | Translate to English                                            |
| ⌘6  | Humanize (removes signs of AI writing)                          |

Humanize follows the [blader/humanizer](https://github.com/blader/humanizer) guide. The guide is sent with the request, which adds about 8k input tokens to it and to every later follow-up in the same view.

A script can pass the text directly instead of the selection: `raycast://extensions/roman.tyshyk/improve-writing-openrouter/improve-writing?context={"text":"…"}` (URL-encoded).

## Settings

- **Default Model**: an OpenRouter model id, `openai/gpt-6-luna` by default. A model picked with ⌘M overrides it until you choose "Reset to Preference Default" (⌘⇧R) in the model list.
- **Prompt**: edit it with ⌘E in the result view. It is a multi-line form, because Raycast preferences have no text area. ⌘⇧R restores the default, and an empty prompt also uses the default. The code always adds a fixed output rule on top, so edits to the prompt can't break pasting.
- **Reasoning Effort**: for reasoning models. `low` by default; `none` is fastest.

## Changing the model

⌘M in the result view lists every OpenRouter chat model, newest first. `:batch` variants are hidden. The list is cached for a day and opens instantly; ⌘R reloads it.

- Each row shows the input and output price per 1M tokens and the context size.
- The search bar dropdown filters by provider, and ⌘⇧P switches to sorting by price.

Developing, CI and publishing: see [CONTRIBUTING.md](https://github.com/rtyshyk/raycast-improve-writing/blob/main/CONTRIBUTING.md).
