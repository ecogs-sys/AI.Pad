# F21 — NotificationBridge does not truncate the title

**Severity:** Medium
**Status:** Open

## Files
- `apps/desktop/src/main/notification-bridge.ts:30-36`

## Problem
`handleAttention` builds `` `${title} needs you` `` from `info?.title`. A long tab
title produces a title beyond `NotificationRequestSchema.title.max(120)`. The schema
is never enforced here (the request is in-process), so an over-long title reaches
the OS notification API unchecked.

## Impact
Over-long notification titles; on some OSes truncated unpredictably.

## Fix approach
Clamp the composed title to 120 chars before calling `service.notify`.

## Test plan
- Code review; optional unit on a small `clampTitle` helper.
