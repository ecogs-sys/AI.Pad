# AI.Pad — Rate-Limit Auto-Resume — Design Spec

**Date:** 2026-05-20
**Status:** Approved (brainstorm), pending implementation plan
**Branch:** `feat/rate-limit-auto-resume`
**Builds on:** `2026-05-17-ai-pad-terminal-design.md`

---

## 1. Problem & promise

AI coding agents such as Claude Code stop and print a usage-limit message when a
quota is exhausted — for example:

```
You've hit your limit · resets 9:30pm (Pacific/Auckland)
```

Today the user must notice this, work out when the limit resets, remember to come
back, and type `continue` by hand. If the reset is hours away (or overnight) the
session sits idle long after it could have resumed.

**This feature** lets AI.Pad watch each tab for a configured phrase, parse the
reset time that follows it, and — at that time — automatically type a configured
response (`continue` by default) into that tab, so a rate-limited session resumes
itself unattended.

## 2. Scope

In scope:

- Detect a user-configured **literal phrase** in any tab's terminal output.
- Parse the **clock time** (and optional IANA timezone) that follows it into an
  absolute instant, choosing the next future occurrence.
- **Fully automatically** type the configured response + Enter into that tab at
  the reset time — no confirmation prompt.
- A **countdown badge** on the tab and sidebar row showing the pending resume,
  with a control to cancel it.
- A **View → Settings** panel to configure: feature enable/disable, the detect
  phrase, and the response text.

Explicitly out of scope:

- **Persisting pending resumes** across an app restart. On restart a session's
  PTY respawns fresh (a bare shell prompt) — the agent process that hit the limit
  is gone — so a resume would type into the wrong context. Pending resumes are
  runtime-only state; they never survive a restart and never repeat. *Settings*
  are persisted; pending resumes are not.
- Day-word or calendar-date reset formats (`tomorrow at 9am`, `resets Nov 5`).
  Only clock times are parsed. A clock time always rolls to the next future
  occurrence, so an overnight reset (limit hit at 11pm, resets `9:30am`) correctly
  schedules for the following morning.
- Confirmation prompts, per-tab setting overrides, regex detect patterns.
- Sending anything other than the single configured response string.

## 3. Behaviour summary

| Aspect | Decision |
|---|---|
| Automation | Fully automatic. On detection, schedule silently; at reset time, send the response with no confirmation. A cancelable badge is the only user touchpoint before firing. |
| Detect text | A literal substring (default `You've hit your limit`). Not a regex. |
| Time formats | Clock time only — `9:30pm`, `3pm`, `11:00 AM` — optionally followed by an IANA timezone in parentheses, e.g. `(Pacific/Auckland)`. No timezone → system local. Always the next future occurrence. |
| Response | A single configured string (default `continue`), sent followed by `\r` (Enter). |
| Persistence | Settings persisted to `userData/settings.json`. Pending resumes are in-memory only. |
| Dedup | One pending resume per session; re-detection while one is pending is ignored. |

## 4. Architecture

The feature is a **Core-plane subsystem**, parallel to the existing
`AttentionDetector`. The Chrome plane only renders settings + badge state and
forwards user intent; terminal renderers are untouched (zero awareness preserved).

```
 pty.onData(chunk)
        │
        ▼
   ┌─────────┐   feeds    ┌────────────────────┐
   │ Session │ ─────────▶ │ RateLimitDetector  │  ANSI-stripped sliding window,
   └────┬────┘            └─────────┬──────────┘  literal phrase search
        │ rateLimitDetected         │ rateLimitDetected { resetText }
        ▼                           ▼
   ┌──────────────────────────────────────────┐
   │ SessionManager                           │
   │   • runs ResetTimeParser(resetText)      │
   │   • if time found && enabled →           │
   │       ResumeScheduler.schedule(id, at)   │
   │   • subscribes to SettingsStore.changed  │
   └──────────┬───────────────────────────────┘
              │
              ▼
   ┌────────────────────┐  periodic sweep   writes responseText + "\r"
   │ ResumeScheduler    │ ───────────────▶  via SessionManager.write(id, …)
   └────────────────────┘
```

## 5. Component reference

### `SettingsStore` (`packages/core/src/settings-store.ts`)

Persists application settings to `userData/settings.json`. Modelled directly on
`SessionStore`.

- Shape: `{ autoResume: { enabled: boolean, detectText: string, responseText: string } }`.
- Defaults: `enabled: true`, `detectText: "You've hit your limit"`, `responseText: "continue"`.
- Atomic write (temp file + rename), debounced (~250 ms).
- Corrupt file on load → back up as `settings.json.broken-<ts>`, start from defaults.
- API: `get(): AppSettings`, `update(next: AppSettings): void`. Event: `changed(AppSettings)`.

### `RateLimitDetector` (`packages/core/src/rate-limit-detector.ts`)

Stream consumer fed the same PTY chunks as `AttentionDetector`.

- `process(chunk: Buffer)` — appends `chunk.toString('utf8')` to a sliding text
  window with ANSI escape sequences stripped (CSI / OSC / other escapes); window
  capped at ~4 KB.
- After each chunk, searches the window for `detectText` as a literal substring.
- Emits `rateLimitDetected({ resetText })` where `resetText` is the matched region
  plus ~200 trailing characters — only on a **false→true transition** (the phrase
  newly appears), so a redrawn TUI frame that keeps the phrase on screen does not
  re-emit.
- `setDetectText(text: string)` — updates the phrase when settings change.
  Empty `detectText` makes the detector inert.
- `dispose()` — clears state.

### `ResetTimeParser` (`packages/core/src/reset-time-parser.ts`)

Pure function — no I/O, no Electron — so it is fully unit-testable.

- `parseResetTime(text: string, now: Date): number | null`.
- Finds a clock-time token: `9:30pm`, `3pm`, `11:00 AM` (12-hour with am/pm;
  optional minutes).
- Finds an optional IANA timezone in parentheses near the time, e.g.
  `(Pacific/Auckland)`. Absent → system local timezone.
- Computes the **next occurrence** of that wall-clock time in that zone strictly
  after `now`; if today's occurrence has passed, uses tomorrow's.
- Returns absolute epoch milliseconds, or `null` if no time token is found.
- Uses **`luxon`** for DST-correct zone math (see §8, decision 1).

### `ResumeScheduler` (`packages/core/src/resume-scheduler.ts`)

Owns all pending resumes.

- State: `Map<SessionId, { resetAt: number, detectedAt: number }>`.
- `schedule(sessionId, resetAt)` — if a pending resume already exists for the
  session, ignore (dedup). Otherwise record the entry.
- A single periodic **sweep** (interval ~20 s) checks every entry; any whose
  `resetAt + GRACE` (`GRACE` = 30 s, allowing the server-side reset to take
  effect) is `<= Date.now()` fires. No long-lived `setTimeout` — the sweep is
  robust across laptop sleep and clock changes.
- On fire: if the session still exists and has not exited, write
  `responseText + "\r"` to it; then remove the entry and emit `resumeFired`.
  If the session has exited, drop the entry silently.
- `cancel(sessionId)` — remove the entry (used by the badge's cancel control and
  by session-close cleanup). Emits `resumeCancelled`.
- `cancelAll()` — used when the feature is disabled in settings.
- Constructed with a `write(sessionId, data)` callback and a
  `getResponseText()` callback.

### Wiring — `Session` & `SessionManager`

- **`Session`** constructs a `RateLimitDetector` alongside its `AttentionDetector`,
  feeds it the same decoded buffer inside `pty.onData`, and re-emits the
  detector's `rateLimitDetected` as a session event. Disposes it on PTY exit.
- **`SessionManager`** owns one `ResumeScheduler` and a reference to the
  `SettingsStore`. On a session's `rateLimitDetected` it runs `ResetTimeParser`;
  if a time is found and `autoResume.enabled` is true, it calls
  `ResumeScheduler.schedule`. It subscribes to `SettingsStore.changed` to push
  the current `detectText` to every session's detector and to call
  `ResumeScheduler.cancelAll()` when the feature is disabled. On session close it
  calls `ResumeScheduler.cancel`. New events: `resumeScheduled(sessionId, resetAt)`,
  `resumeCancelled(sessionId)`, `resumeFired(sessionId)`.

## 6. IPC contracts (`@aipad/contracts`)

New file `settings.ts`:

- `AppSettingsSchema` — Zod schema. `autoResume.enabled: boolean`,
  `autoResume.detectText: string` (0–200 chars), `autoResume.responseText: string`
  (0–200 chars). The schema permits an empty `detectText` (feature treated as
  inert); the Settings panel additionally requires it to be non-empty when
  *enabled* is checked (§7). Empty `responseText` is allowed (sends just Enter).

New channels added to `IpcChannel`:

| Channel | Direction | Payload |
|---|---|---|
| `core.settings.get` | renderer → main | — → `AppSettings` |
| `core.settings.update` | renderer → main | `AppSettings` |
| `core.resume.cancel` | renderer → main | `{ sessionId }` |
| `event.settings.changed` | main → renderer | `AppSettings` |
| `event.resume.scheduled` | main → renderer | `{ sessionId, resetAt }` |
| `event.resume.cancelled` | main → renderer | `{ sessionId }` |
| `event.resume.fired` | main → renderer | `{ sessionId }` |

The `SessionStatus` enum is **not** changed. The countdown badge is separate UI
state driven by the `event.resume.*` messages, which keeps the persistence and
contract blast radius small.

## 7. UI

### Settings panel

- A `Settings…` item is added to the existing **View** submenu in
  `apps/desktop/src/main/app-menu.ts`; its `click` sends an `openSettings` action
  to the chrome renderer.
- The chrome renderer opens a modal via the existing modal-mount pattern (new
  `settings-dialog.ts`, mirroring `new-session-dialog.ts`), sending
  `LayoutModal { open: true }` to suspend the terminal `WebContentsView` while the
  modal is open.
- Fields: an *Enable auto-resume* checkbox, a *Text to detect* text input, and a
  *Response to send* text input. Current values loaded via `core.settings.get`;
  Save writes via `core.settings.update`; Cancel / Escape closes with no change.
- Validation: when *enabled* is checked, *Text to detect* must be non-empty.

### Countdown badge

- On `event.resume.scheduled` for a session, the `TabStrip` tab and the `Sidebar`
  row for that session show a small badge — e.g. `⏳ 9:30pm` — with a `✕` control
  that sends `core.resume.cancel`.
- The badge is cleared on `event.resume.cancelled`, `event.resume.fired`, or
  session exit.
- Styled consistently with the existing attention badges; chrome state is held in
  the existing `state.ts` and rendered by `tab-strip.ts` / `sidebar.ts`.

## 8. Key decisions

1. **Timezone math uses `luxon`.** Computing "next occurrence of wall-time X in
   IANA zone Z" DST-correctly is fiddly with bare `Intl`. `luxon` is a small,
   well-tested dependency added to `@aipad/core` (with `@types/luxon`). The
   implementation plan may revisit this if a dependency-free `Intl` approach is
   preferred.
2. **Sweep, not per-resume timers.** A single ~20 s interval over the pending map
   replaces long-lived `setTimeout`s, which are unreliable across OS sleep. Cost:
   a resume may fire up to ~20 s late — acceptable, and the 30 s grace buffer
   already adds intentional delay.
3. **Grace buffer of 30 s** after the parsed reset time, so the agent's
   server-side quota has actually reset before the response is typed.
4. **No new `SessionStatus` value** — resume state is tracked purely through the
   `event.resume.*` channel, avoiding churn in the session/persistence contracts.
5. **Pending resumes are not persisted** — see §2.

## 9. Error handling

- **Phrase detected but no parseable time** → no schedule; a debug log line only.
- **`detectText` empty** or **feature disabled** → detectors inert; existing
  pending resumes cancelled via `ResumeScheduler.cancelAll()`.
- **`responseText` empty** → permitted; the scheduler sends just `\r`.
- **Session exits before reset time** → entry dropped by session-close cleanup;
  if one slips through, the fire-time exited-session check drops it.
- **Re-detection while a resume is pending** → ignored (one pending per session).
- **Settings file corrupt / unwritable** → `SessionStore`-style resilience: back
  up corrupt files, fall back to defaults, surface a non-blocking warning; the
  app always launches.
- **Multiple tabs rate-limited at once** → each gets an independent pending
  resume; the scheduler handles them uniformly.

## 10. Testing strategy

**Unit (Vitest, no Electron).**

- **`ResetTimeParser` — highest-leverage suite.** Time with IANA timezone; time
  with no timezone → system local; day-rollover (now 11pm, time `9:30am` →
  tomorrow); today's time still in the future; a DST-boundary date; no time token
  → `null`; garbage input → `null`.
- **`RateLimitDetector`** — phrase split across chunk boundaries; ANSI escape
  codes interspersed within and around the phrase; multibyte `·` not corrupted;
  no re-emit while the phrase stays on screen (false→true transition only);
  re-emit after the phrase scrolls out and reappears.
- **`ResumeScheduler`** — schedule / dedup / cancel; sweep fires a due entry;
  exited-session entry is dropped without writing; grace buffer respected.
- **`SettingsStore`** — round-trip, atomic write, corrupt-file recovery, defaults.
- **`@aipad/contracts`** — `AppSettings` and the new payload schemas: valid and
  invalid examples.

**Integration (Vitest + real `node-pty`, main only).**

- A script prints the detect phrase followed by a near-future clock time → assert
  a resume is scheduled, and that the response bytes are written to the PTY when
  the sweep fires (using a short offset / injectable clock).

**End-to-end (Playwright + built Electron).**

- Open **View → Settings**, change the response text, save, reopen → the new value
  persists.

## 11. Files

**New (`packages/core/src/`):** `settings-store.ts`, `rate-limit-detector.ts`,
`reset-time-parser.ts`, `resume-scheduler.ts` — each with a colocated test.

**Modified (`packages/core/src/`):** `session.ts`, `session-manager.ts`,
`index.ts`.

**New (`packages/contracts/src/`):** `settings.ts`. **Modified:** `ipc.ts`,
`index.ts`.

**Modified (`apps/desktop/src/`):** `main/app-menu.ts`, `main/index.ts` and the
IPC-handler registration site, `preload/index.ts`,
`renderer/chrome/main.ts`, `renderer/chrome/tab-strip.ts`,
`renderer/chrome/sidebar.ts`, `renderer/chrome/state.ts`, plus chrome CSS.

**New (`apps/desktop/src/renderer/chrome/`):** `settings-dialog.ts`.

**Dependency:** add `luxon` + `@types/luxon` to `@aipad/core`.

## 12. Open items for the implementation plan

1. Confirm `luxon` vs. a dependency-free `Intl`-based parser (decision §8.1).
2. Exact sweep interval and grace-buffer values (defaults: 20 s / 30 s).
3. Whether the detect-phrase match should be case-sensitive (lean: case-insensitive).
4. Badge styling details and the cancel-control affordance.
