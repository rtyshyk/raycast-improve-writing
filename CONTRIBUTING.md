# Contributing

## Development

```sh
npm install
npm run dev         # imports the extension into Raycast; it stays after you stop the dev server
npm test            # vitest: unit tests for src/lib, view tests for the components and commands
npm run typecheck   # extension code (Node types) and tests (DOM types)
npm run lint        # ray lint, plus ESLint and Prettier on test/
```

The tests replace `@raycast/api` with an in-memory mock (`test/mocks/raycast-api.tsx`) that renders views as plain DOM, and stub `fetch` for OpenRouter. The real `@raycast/utils` hooks run against that mock.

## Humanize guide

The Humanize preset sends [blader/humanizer](https://github.com/blader/humanizer)'s `SKILL.md`, vendored unchanged with its MIT license in `assets/humanizer/` (commit `225a6f3`). To update it, replace `assets/humanizer/SKILL.md` with the newer upstream file and run the tests. Keep it out of a top-level `skills/` folder: the Raycast CLI bundles `skills/<name>/SKILL.md` as an extension skill.

## CI and releases

GitHub Actions (`.github/workflows/`):

- **CI** runs on every push to `main` and every pull request: `npm ci`, lint, a `dist` build (which also generates the `Preferences` types), typecheck and tests. The build is kept as the `extension-dist` artifact.
- **Release** runs when you push a `v*` tag. It runs the full CI first and, only if that passes, creates a GitHub release with the built extension attached as a zip. Nothing is published to the Raycast Store.

```sh
git tag v1.0.0 && git push origin v1.0.0
```

CI uses the Node version in `.nvmrc` (24; the Raycast CLI needs 22.22.2 or newer).

## Publishing to the Raycast Store

`npm run publish` opens a pull request to [raycast/extensions](https://github.com/raycast/extensions) (it asks you to sign in to GitHub). After Raycast's review it is merged and appears in the Store. Later updates go the same way; if anyone changed the extension there, run `npx @raycast/api@latest pull-contributions` first.

Before publishing:

- Update to the latest `@raycast/api` and `@raycast/utils`, then run `npm run lint`, `npm run build:dist`, `npm run typecheck` and `npm test`.
- Add 3–6 screenshots to `metadata/`: PNG, 2000×1250, one light background for all, no personal text. Raycast's Window Capture with "Save to Metadata" takes them in that format. `media/` is only for images the README links to.
- Add a `CHANGELOG.md` entry: `## [Title] - {PR_MERGE_DATE}`.
