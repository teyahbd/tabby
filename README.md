# Tabby

A small desktop pet that lives in a browser tab. Personal project, not for
distribution.

## Install (load unpacked)

1. `pnpm install && pnpm build`
2. Open `chrome://extensions`, enable **Developer mode**
3. **Load unpacked** → select the **`dist/`** folder
4. Open a normal web page — a placeholder blob sits in the bottom-right corner

`dist/` is committed, so a fresh clone can skip step 1 and load `dist/` directly.
It is an unminified build of `src/` on purpose: the code Chrome runs stays
readable and checkable against `manifest.json`.

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

## Permissions

Nothing in `permissions` yet. The content script matches `<all_urls>` so the pet
can appear on the active tab whatever it is — injection only, it reads no page
content.
