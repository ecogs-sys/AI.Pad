# F24 — electron-builder permanently disables macOS signing

**Severity:** Medium
**Status:** Fixed (commit `fix(F15,F24)`)

## Files
- `apps/desktop/electron-builder.json`

## Problem
`"mac": { "identity": null }` permanently disables macOS code signing. Fine for
local/dev builds, but a release build would ship an unsigned/unnotarised app.

## Impact
Release artefacts on macOS would be unsigned unless this is overridden.

## Fix approach
Keep `identity: null` for the default config (dev convenience) but document that
release builds must override it (via `CSC_LINK`/`CSC_KEY_PASSWORD` env or a separate
config). Add a comment-equivalent note in the README "Installation" section and a
`docs` note. (Obtaining certs is out of scope per Plan 3.)

## Test plan
- Doc review.
