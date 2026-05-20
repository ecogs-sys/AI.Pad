# F22 — NewSessionDialog default cwd '~' breaks on Windows

**Severity:** Medium
**Status:** Fixed (commit `fix(F22)`)

## Files
- `apps/desktop/src/renderer/chrome/layout-manager.ts:110-117`

## Problem
`platformDefaultCwd()` falls back to the literal `'~'` when no prior session exists.
On Windows, `node-pty.spawn({ cwd: '~' })` fails — `~` is not expanded. A fresh
install with no persisted tabs that opens the dialog before the boot tab is known
could pass `'~'`.

## Impact
`SessionCreate` can fail with an unhelpful spawn error on Windows.

## Fix approach
Add an IPC `core.layout.default-cwd` that returns `homedir()` from main, or include
the home directory in an existing bootstrap payload the chrome already receives.
Chrome uses that instead of `'~'`.

## Test plan
- Manual on Windows: open the dialog on a fresh profile; cwd pre-fills with the real
  home directory.
