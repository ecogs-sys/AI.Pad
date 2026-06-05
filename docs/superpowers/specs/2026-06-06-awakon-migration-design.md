# Awakon Migration Design

**Date:** 2026-06-06
**Status:** Approved

## Summary

Migrate the AI.Pad project to a new repository (`ecogs-sys/Awakon`) with full rebranding from `AI.Pad` / `@aipad/` to `Awakon` / `@awakon/`. Full git history is preserved. The AI.Pad repository is left untouched.

## Context

- **Source:** `C:\Work\ecogs\projects\AI.Pad` → `https://github.com/ecogs-sys/AI.Pad.git`
- **Destination:** `C:\Work\ecogs\projects\Awakon` → `https://github.com/ecogs-sys/Awakon.git`
- **Company:** ecogs
- **App name:** Awakon (formerly AI.Pad)

## Approach: Push History → Pull → Rebrand

All work happens in two stages. Stage 1 moves git history; Stage 2 applies the rebrand.

### Stage 1: Git History Migration

From the AI.Pad repo:
```
git remote add awakon https://github.com/ecogs-sys/Awakon.git
git push awakon main
```

From the Awakon repo:
```
git pull origin main --allow-unrelated-histories
```

The Awakon local repo now contains the full AI.Pad source tree and complete git history.

### Stage 2: Rebranding Commit

A single commit in the Awakon repo applies all substitutions:

| What | From | To |
|------|------|----|
| Package scope | `@aipad/` | `@awakon/` |
| Root package name | `aipad` | `awakon` |
| App product name | `AI.Pad` | `Awakon` |
| App ID | `com.ecogs.aipad` | `com.ecogs.awakon` |
| Linux executable name | `aipad` | `awakon` |
| GitHub repo references | `ecogs-sys/AI.Pad` | `ecogs-sys/Awakon` |
| GitHub homepage | `ecogs/AI.Pad` | `ecogs/Awakon` |

#### Files Changed

**Package manifests:**
- `package.json` (root) — `name: aipad` → `name: awakon`
- `apps/desktop/package.json` — `name: @aipad/desktop` → `@awakon/desktop`, homepage, workspace deps
- `packages/contracts/package.json` — `name: @aipad/contracts` → `@awakon/contracts`
- `packages/core/package.json` — `name: @aipad/core` → `@awakon/core`, dep `@aipad/contracts` → `@awakon/contracts`
- `packages/keymap/package.json` — `name: @aipad/keymap` → `@awakon/keymap`
- `packages/terminal-host/package.json` — `name: @aipad/terminal-host` → `@awakon/terminal-host`, dep `@aipad/contracts` → `@awakon/contracts`
- `tests/e2e/package.json` — `name: @aipad/e2e` → `@awakon/e2e`
- `tests/integration/package.json` — `name: @aipad/integration` → `@awakon/integration`, deps `@aipad/*` → `@awakon/*`

**Build / release config:**
- `apps/desktop/electron-builder.json` — `appId`, `productName`, GitHub publish `repo`
- `release-please-config.json` — package names and group name
- `.release-please-manifest.json` — package keys

**CI/CD workflows:**
- `.github/workflows/ci.yml` — `@aipad/desktop`, `@aipad/e2e` filter references
- `.github/workflows/release.yml` — `@aipad/desktop` filter references
- `.github/workflows/release-please.yml` — any `aipad` references

**Source files (imports + UI strings):**

All `.ts`, `.tsx`, and `.html` files under `apps/desktop/src/` that contain either:
- `@aipad/` import paths (e.g., `import ... from '@aipad/contracts'`) — replaced with `@awakon/`
- `"AI.Pad"` or `'AI.Pad'` as a user-visible UI string — replaced with `"Awakon"`

Known files from grep (not exhaustive — implementation uses search-and-replace):
- `apps/desktop/src/main/app-menu.ts` — "About AI.Pad" menu entry
- `apps/desktop/src/main/index.ts`, `fs-handlers.ts`, `notification-bridge.ts`, `session-bootstrap.ts`, `view-manager.ts`
- `apps/desktop/src/preload/index.ts`
- `apps/desktop/src/renderer/chrome/about-dialog.ts`, `titlebar.ts`, `main.ts`, `keyboard.ts`, `layout-manager.ts`, `new-session-dialog.ts`, `settings-dialog.ts`, `sidebar.ts`, `state.ts`, `tab-strip.ts`
- `apps/desktop/src/renderer/terminal/context-menu.ts`, `main.ts`
- `apps/desktop/index.html`, `terminal-host.html` — `<title>` tags

**Docs:**
- `README.md` — project name, badges, GitHub links

**Lock file:**
- `pnpm-lock.yaml` — regenerated via `pnpm install` after all package.json edits

#### Files NOT Changed

- `CHANGELOG.md` / `apps/desktop/CHANGELOG.md` — release history is kept as-is
- `.vs/` IDE artifacts — not tracked in git
- `docs/design_handoff_aipad_redesign/` — archived design docs, kept for reference
- `apps/desktop/release/` — build artifacts, not tracked in git

### Stage 3: Push to Awakon Remote

```
git push origin main
```

## Final State

| | AI.Pad | Awakon |
|--|--------|--------|
| Local path | `C:\Work\ecogs\projects\AI.Pad` | `C:\Work\ecogs\projects\Awakon` |
| Remote | `ecogs-sys/AI.Pad` (unchanged) | `ecogs-sys/Awakon` |
| History | Original | Full AI.Pad history + rebrand commit |
| Package scope | `@aipad/` | `@awakon/` |
| App name | `AI.Pad` | `Awakon` |
| App ID | `com.ecogs.aipad` | `com.ecogs.awakon` |
