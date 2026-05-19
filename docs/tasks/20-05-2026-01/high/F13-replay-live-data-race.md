# F13 — Live-data / replay race in TerminalHost

**Severity:** High
**Status:** Open

## Files
- `packages/terminal-host/src/terminal-host.ts:71-97`

## Problem
Plan 2 §5 claims live data is "queued behind the snapshot". xterm does not queue —
`wireOutput`'s `event.session.data` handler and `replay()` both call `term.write`
directly. PTY data arriving between `wireOutput` registration and `replay()`
resolving is written **before** the snapshot, then the snapshot writes again →
out-of-order / duplicated scrollback under load.

## Impact
Garbled or duplicated scrollback when a session is producing output during mount or
crash-recovery replay.

## Fix approach
Buffer live `event.session.data` chunks in a local array until `replay()` resolves.
Sequence:
1. Register `wireOutput` listener but push chunks to a pending buffer while
   `replayComplete === false`.
2. Run `replay()`; on resolve, write the snapshot, then drain the pending buffer in
   order, then set `replayComplete = true` so subsequent chunks write directly.

## Test plan
- Unit (terminal-host has no test suite today): add a minimal Vitest test with a
  fake bridge + fake terminal asserting snapshot is written before buffered live
  chunks, and order is preserved.
