# F20 — RingBuffer spec/impl mismatch on UTF-8 safety

**Severity:** Medium
**Status:** Open

## Files
- `packages/core/src/ring-buffer.ts`
- `docs/superpowers/specs/2026-05-17-ai-pad-terminal-design.md` §5

## Problem
Spec §5 says the RingBuffer keeps "UTF-8-safe boundaries" and §8 lists a test for
"multi-byte UTF-8 not split". The implementation operates on raw bytes and a comment
explicitly says boundary safety is the caller's concern.

## Impact
Documentation/implementation mismatch. In practice harmless: `snapshot()` consumers
decode via `TextDecoder`, which tolerates partial leading/trailing bytes.

## Fix approach
The byte-level ring buffer is the correct design (a terminal stream must not lose
bytes). Resolve the mismatch by aligning the doc: the *consumer* (`TextDecoder`)
handles boundary safety; the buffer is byte-exact. Update the RingBuffer doc comment
to state this clearly, and note in the spec that boundary safety is a decode-time
concern. No behavioural change.

## Test plan
- Unit: write a multi-byte UTF-8 string split across two `write()` calls; `snapshot()`
  decoded with `TextDecoder` reproduces the original string.
