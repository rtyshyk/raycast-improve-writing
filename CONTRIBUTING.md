# Contributing

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

## Publishing to the Raycast Store

`npm run publish` opens a pull request to [raycast/extensions](https://github.com/raycast/extensions) (it asks you to sign in to GitHub). After Raycast's review it is merged and appears in the Store. Later updates go the same way; if anyone changed the extension there, run `npx @raycast/api@latest pull-contributions` first.

Before publishing:

- Update to the latest `@raycast/api` and `@raycast/utils`, then run `npm run lint`, `npm run build:dist`, `npm run typecheck` and `npm test`.
- Add 3–6 screenshots to `media/`: PNG, 2000×1250, extension only, no personal text.
- Add a `CHANGELOG.md` entry: `## [Title] - {PR_MERGE_DATE}`.
