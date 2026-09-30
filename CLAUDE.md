# CLAUDE.md

Raycast 2 extension "Improve Writing (OpenRouter)": one view command, `improve-writing`, that improves the selected text with an OpenRouter model, shows a highlighted diff and pastes the result back. Developer docs: `CONTRIBUTING.md`.

## Map

- `src/improve-writing.tsx`: reads the selection (with a retry for apps like Slack, where Raycast returns the old clipboard), falls back to the clipboard, and accepts `launchContext.text` from a deeplink.
- `src/components/ImproveView.tsx`: the version list (turns), streaming, typed follow-ups, presets and all result actions. `ModelList.tsx` (⌘M) and `PromptForm.tsx` (⌘E) are pushed from it.
- `src/lib/`: `openrouter.ts` (streaming chat, error text), `improve.ts` (one turn), `prompt.ts` (default prompt, `OUTPUT_CONTRACT`, `buildMessages`, `splitSelection`), `preview.ts` (diff drawn as an SVG image), `presets.ts`, `model.ts`, `model-catalog.ts`.

## Checks

Run the full gate before every push; CI runs the same and fails on Prettier formatting:

```sh
npm run lint && npm run typecheck && npm test && npm run build:dist
```

Node 24 (`.nvmrc`). Don't run `npm run dev` from a git worktree: it re-imports the extension into Raycast from that path.

## Conventions

- Small pure functions in `src/lib`; views stay thin. Comments are one line and only for real gotchas.
- Tests use vitest, with `@raycast/api` replaced by `test/mocks/raycast-api.tsx` (alias in `vitest.config.mts`). Any new Raycast API the code calls must be added to the mock. `environment.assetsPath` points at the real `assets/`. No custom assertion messages.
- The first action in an `ActionPanel` is ↵, so section order is behavior. Presets sit in the last section, so ↵ on the Original row and on failed rows stays Regenerate.
- Finished turns keep their object identity; the diff cache is a `WeakMap` keyed by turn.
- `OUTPUT_CONTRACT` is always added after the user's prompt, and the text goes inside `<text>` tags, so prompt edits can't break pasting. Pasting puts back the selection's leading and trailing whitespace (`splitSelection`).
- Raycast markdown can't color text, so the preview is an SVG image. jsdiff's word tokenizer splits Cyrillic letter by letter, hence the custom `TOKEN` regex.

## Raycast Store (checked 2026-09-28)

- The README is shown on the Store page and behind "About This Extension". Write it for users; setup, build and publishing material goes in `CONTRIBUTING.md`, linked by absolute GitHub URL. `help.md` is shown beside the required API key field.
- Screenshots go in `metadata/` (3 to 6, PNG, 2000×1250, one background). `media/` is only for images the README links to.
- `CHANGELOG.md` entries are `## [Title] - {PR_MERGE_DATE}`. Until the first publish, add bullets to "Initial Version".
- `author` must be the Raycast account username, `license` MIT, npm with `package-lock.json`, and the latest `@raycast/api` at submission. The local npm config may enforce a minimum release age, so a just-released version fails with `ETARGET`; don't bypass it without asking.
- No `navigationTitle` on the root command's view (`ImproveView`); only on pushed views. Title Case action titles, an icon on every action, placeholders on search bars and text areas, US English. No Keychain access, no analytics, the word "Assistant" is banned in names.
- The Raycast CLI bundles a top-level `skills/<name>/SKILL.md` as an extension skill. The vendored humanizer guide therefore lives in `assets/humanizer/`.
- Rejection risk: Raycast rejects extensions that duplicate Raycast AI or existing Store extensions. The closest is Text Enhance (OpenRouter or other keys, purposes such as Slack or email, named presets, follow-up corrections, Compare with Original with highlighted words, history; it copies the result instead of pasting). OpenRouter Quick Actions has a streaming Proofread and Replace but no diff or follow-ups; Grammarix is OpenAI-only. What this one adds: paste back over the selection, a diff for every kept version, Humanize, and the live model list with prices and provider filter. Say so in the Store PR description.
- The API key is a `password` preference: Raycast stores it in its encrypted local database, scoped to this extension. The code only sends it as the `Authorization` header to openrouter.ai.

## Humanize

The ⌘6 preset sends `assets/humanizer/SKILL.md` (blader/humanizer, MIT, commit `225a6f3`, vendored unchanged) as the follow-up instruction and asks for the guide's embedded mode (final text only). It is about 8k input tokens and stays in the history, so later follow-ups resend it.

## Git

- Personal repo, so the repo-local `user.*` and `core.sshCommand` are set on purpose; don't change or override them.
- The `gh` CLI on this machine may be signed in to a different account; don't use it for this repo. Open PRs with a prefilled compare URL (`/compare/main...<branch>?expand=1&title=…&body=…`) and let the user click Create.
- One branch and PR per change. Bring `main` into a pushed branch with a merge, not a rebase.

## Backlog

Not started: cost per turn (OpenRouter returns usage in the last stream chunk), Explain Changes (⌘I), model fallbacks (the `models` array), recent and favorite models in ⌘M, an Instant Fix no-view command, custom commands from saved prompts (and editable presets), opt-in history.

Rejected, don't propose again: tone from the frontmost app (2026-09-28), accepting or rejecting individual changes (Raycast has no interactive text UI).
