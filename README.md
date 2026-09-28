# Improve Writing (OpenRouter)

A Raycast 2 extension that works like Raycast AI's "Improve Writing", but runs on any OpenRouter model with your own key.

Select text in any app and run **Improve Writing**. The result streams in, then shows the changes highlighted against your selection: green for added text, red and struck through for removed text. Press ↵ to paste it over the selection.

Type a follow-up in the search bar (e.g. "more casual", "shorter", "translate to Ukrainian") and press ↵ to revise the result, or pick a preset with ⌘1…⌘6. Each version stays in the list on the left, so ↑/↓ and ↵ paste an earlier one.

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
| ⌘1  | Shorter                                                         |
| ⌘2  | More Formal                                                     |
| ⌘3  | More Casual                                                     |
| ⌘4  | Fix Grammar Only (back to the original, no rewording)           |
| ⌘5  | Translate to English                                            |
| ⌘6  | Humanize (removes signs of AI writing)                          |

Humanize sends [blader/humanizer](https://github.com/blader/humanizer)'s guide, vendored unchanged in `assets/humanizer/` (MIT, commit `225a6f3`), with the request. That adds about 8k input tokens to the Humanize request and to every later follow-up in the same view. To update it, replace `assets/humanizer/SKILL.md` with the newer upstream file.

A script can pass the text directly instead of the selection: `raycast://extensions/roman.tyshyk/improve-writing-openrouter/improve-writing?context={"text":"…"}` (URL-encoded).

## Settings

- **Default Model**: an OpenRouter model id, `openai/gpt-6-luna` by default. **Choose Model** overrides it until you run "Reset to Preference Default" (⌘⇧R).
- **Prompt**: edit it with the **Edit Prompt** command or ⌘E in the result view. It is a multi-line form, because Raycast preferences have no text area. ⌘⇧R restores the default, and an empty prompt also uses the default. The code always adds a fixed output rule on top, so edits to the prompt can't break pasting.
- **Reasoning Effort**: for reasoning models. `low` by default; `none` is fastest.

## Choose Model

Choose Model lists every OpenRouter chat model, newest first. `:batch` variants are hidden. The list is cached for a day and opens instantly; ⌘R reloads it.

- Each row shows the input and output price per 1M tokens and the context size.
- The search bar dropdown filters by provider, and ⌘⇧P switches to sorting by price.

## Development

```sh
npm test            # vitest: unit tests for src/lib, view tests for the components and commands
npm run typecheck   # extension code (Node types) and tests (DOM types)
npm run lint        # ray lint, plus ESLint and Prettier on test/
```

The tests replace `@raycast/api` with an in-memory mock (`test/mocks/raycast-api.tsx`) that renders views as plain DOM, and stub `fetch` for OpenRouter. The real `@raycast/utils` hooks run against that mock.

## CI and releases

GitHub Actions (`.github/workflows/`):

- **CI** runs on every push to `main` and every pull request: `npm ci`, lint, a `dist` build (which also generates the `Preferences` types), typecheck and tests. The build is kept as the `extension-dist` artifact.
- **Release** runs when you push a `v*` tag. It runs the full CI first and, only if that passes, creates a GitHub release with the built extension attached as a zip. Nothing is published to the Raycast Store.

```sh
git tag v1.0.0 && git push origin v1.0.0
```

CI uses the Node version in `.nvmrc` (24; the Raycast CLI needs 22.22.2 or newer).
