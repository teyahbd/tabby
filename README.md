# Tabby

A small desktop pet that lives in a browser tab. Personal project, not for
distribution.

## Install (load unpacked)

1. `pnpm install && pnpm build`
2. Open `chrome://extensions`, enable **Developer mode**
3. **Load unpacked** → select the **`dist/`** folder
4. Open a normal web page — Tabby sits in the bottom-right corner

`dist/content.js` is committed (unminified on purpose — the code Chrome runs
stays readable and checkable against `manifest.json`), but `dist/pet.css` is
**not**: it bakes in the non-redistributable sprite sheet, so it has to be
rebuilt locally with `pnpm build` after obtaining the sprite pack (see
[`CREDITS.md`](CREDITS.md)). Without it the pet still runs but renders unstyled.

## Dev

```
pnpm build         # bundle src/ -> dist/ via esbuild (no minify)
pnpm typecheck     # tsc --noEmit
pnpm test          # node --test (src/**/*.test.ts)
pnpm format        # prettier --write
pnpm check         # everything CI runs, in order
```

Git hooks are wired automatically by `pnpm install` (`core.hooksPath .githooks`):

- **pre-commit** — formatting check
- **pre-push** — full `check` (typecheck, test, build, `dist/` up to date)

Bypass with `--no-verify`. CI ([`.github/workflows/ci.yml`](.github/workflows/ci.yml))
runs the same steps on push and PR.

## Layout

- `src/content/` — content script entry (injected per page)
- `src/render/` — pet element + layout math. DOM only, no `chrome.*`.
- `src/platform/` — thin wrappers over `chrome.*` (only `storage` so far)
- `manifest.json` — source of truth; copied into `dist/` by the build

## Art

Cat sprites are by DelineArte — see [`CREDITS.md`](CREDITS.md). The raw files
are not committed (license forbids redistributing them); `Cat Sprites/` is
git-ignored. Obtain the pack separately to rebuild the art locally.

## Sounds

The petting meows are derived from a CC0 freesound clip by itinerantmonk108 —
see [`CREDITS.md`](CREDITS.md). The `.wav` files are committed under
`src/assets/sounds/` and embedded into `dist/` at build time.

## Permissions

Nothing in `permissions` yet. The content script matches `<all_urls>` so the pet
can appear on the active tab whatever it is — injection only, it reads no page
content.
