---
status: partial
phase: 02-onboarding
source: [02-VERIFICATION.md]
started: 2026-03-26T00:00:00.000Z
updated: 2026-03-26T00:00:00.000Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. New user online flow
expected: Full trade selection → seeding → ready → app navigation completes without error on a running device/simulator
result: [pending]

### 2. Single-select enforcement
expected: Tapping a second trade card deselects the first; only one trade can be active at a time
result: [pending]

### 3. Returning user skip
expected: Relaunching the app after completing onboarding routes directly to (app), bypassing all onboarding screens
result: [pending]

### 4. Offline fallback
expected: With airplane mode active, seeding screen shows amber notice and uses bundled offline templates (not API)
result: [pending]

### 5. ONBD-03 timing
expected: Full onboarding flow completes under 90 seconds on a mid-range device
result: [pending]

### 6. Post-logout re-login skip
expected: Logging out and logging back in with an existing trade skips onboarding entirely
result: [pending]

## Summary

total: 6
passed: 0
issues: 0
pending: 6
skipped: 0
blocked: 0

## Gaps
