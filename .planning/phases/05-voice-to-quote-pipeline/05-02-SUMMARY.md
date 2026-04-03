---
phase: 05-voice-to-quote-pipeline
plan: 02
subsystem: mobile
tags: [voice, recording, expo-av, watermelondb, sync-queue, ui]
dependency_graph:
  requires: []
  provides: [voice-recording-screen, dual-fab-quotes, ai-processing-row-state, sync-queue-audio-case, schema-v2]
  affects: [quotes-tab, quote-history, sync-queue, watermelondb-schema]
tech_stack:
  added: [expo-av, expo-file-system]
  patterns: [FormData-multipart-upload, animated-pulse-waveform, polling-loop-1500ms, schema-migration-watermelondb]
key_files:
  created:
    - apps/mobile/src/api/voice.ts
    - apps/mobile/src/db/migrations.ts
    - apps/mobile/src/components/voice/recording-waveform.tsx
    - apps/mobile/app/(app)/voice-record.tsx
  modified:
    - apps/mobile/src/db/schema.ts
    - apps/mobile/src/db/index.ts
    - apps/mobile/src/db/models/quote.ts
    - apps/mobile/src/sync/sync-queue.ts
    - apps/mobile/app/(app)/quotes.tsx
    - apps/mobile/app/(app)/_layout.tsx
    - apps/mobile/src/components/quotes/quote-row.tsx
    - apps/mobile/src/components/quotes/status-badge.tsx
    - apps/mobile/package.json
decisions:
  - expo-av Recording.createAsync with HIGH_QUALITY preset: standard approach for iOS/Android voice recording
  - FileSystem.moveAsync from cacheDirectory to documentDirectory immediately after stopAndUnloadAsync: required per VOICE-02 constraint for Android cache eviction safety
  - Animated.loop with staggered per-bar delays for waveform pulse: avoids real-time audio data dependency while giving visual feedback
  - schemaMigrations passed to SQLiteAdapter: required for WatermelonDB to upgrade existing databases without data loss
  - Polling loop lives in QuotesScreen useEffect watching quotes array: reactive to WatermelonDB observable, stops automatically when no ai_processing quotes remain
  - TAB_BAR_HEIGHT constant of 56: safe default for both iOS and Android without platform detection
metrics:
  duration: 6m
  completed: 2026-04-03
  tasks_completed: 2
  files_changed: 13
---

# Phase 05 Plan 02: Mobile Recording UI and Voice Pipeline Wiring Summary

**One-liner:** expo-av recording screen with cacheDirectory→documentDirectory move, ai_processing quote row state, dual FAB on Quotes tab, WatermelonDB schema v2 with voice_job_id, and 1.5s polling loop.

## What Was Built

### Task 1: Schema bump, Quote model, voice API client, and sync queue audio case (commit b48f14e)

- Bumped WatermelonDB schema from v1 to v2, adding `voice_job_id` (optional string) column to the quotes table
- Created `src/db/migrations.ts` with `schemaMigrations` v2 migration using `addColumns` — passed to `SQLiteAdapter` in `db/index.ts` so existing databases upgrade without data loss
- Added `@text('voice_job_id') voiceJobId` field to the `Quote` model
- Created `src/api/voice.ts` with:
  - `uploadAudio(filePath, quoteServerId)` — multipart FormData POST to `/voice/upload`
  - `getVoiceStatus(jobId)` — GET to `/voice/status/:jobId` returning `processing | complete | failed`
  - Both functions lazy-import `useAuthStore` to avoid circular dependency (same pattern as `apiClient`)
- Added `audio` entity type case to `sync-queue.ts` `pushToServer()`: queries local quote by `quoteLocalId`, calls `uploadAudio`, writes back `voiceJobId` and `serverId`
- Installed `expo-av` (~15.0.2) and `expo-file-system` (~18.0.12) via `npx expo install`

### Task 2: Recording screen, dual FAB, ai_processing row state, and polling loop (commit 90075db)

- Created `src/components/voice/recording-waveform.tsx`: 5 vertical bars with staggered `Animated.loop` scaleY pulse animation; stops and resets to resting height when `isRecording` is false; `accessibilityElementsHidden` (decorative)
- Created `app/(app)/voice-record.tsx` (`VoiceRecordScreen`):
  - State machine: `idle | recording | stopped`
  - Requests microphone permission with Settings deep-link fallback on denial
  - `Audio.setAudioModeAsync` with `allowsRecordingIOS: true` before recording, reset after
  - `FileSystem.moveAsync` from cacheDirectory to documentDirectory is the **first** operation after `stopAndUnloadAsync` (VOICE-02)
  - Creates `ai_processing` quote + draft in a single `database.write` transaction
  - Enqueues `{ entityType: 'audio', ... }` to sync queue then calls `router.back()`
  - Duration counter (MM:SS format) with `setInterval` in ref, cleared on stop and unmount
- Registered `voice-record` screen in `_layout.tsx` with `tabBarStyle: { display: 'none' }` and `href: null`
- Refactored `app/(app)/quotes.tsx`:
  - Replaced single FAB with Voice Quote FAB (primary, accent, bottom) + Manual Quote FAB (above, secondary, muted border)
  - Renamed `handleFabPress` → `handleManualQuotePress` (same logic)
  - Added `handleQuotePress` guard: returns early for `ai_processing` status
  - Added polling `useEffect` watching `quotes` array: filters for `ai_processing && voiceJobId`, calls `getVoiceStatus` at 1500ms intervals when online, cleans up timer on unmount or when no processing quotes remain
  - Updated `contentContainerStyle` on FlatList to account for both FABs' height
- Updated `src/components/quotes/quote-row.tsx`:
  - `ai_processing` rows: background `colors.secondary`, shows "New job" as phone text
  - Online: `ActivityIndicator` + "Processing..." text
  - Offline: `cloud-upload-outline` icon + "Queued" text
  - Disabled press when `ai_processing`
  - Correct `accessibilityLabel` for each state
- Added `ai_processing: { label: 'Processing', bg: '#e0f0ff', text: '#0066cc' }` to `StatusBadge`

## Deviations from Plan

### Auto-fixed Issues

None.

### Minor Adjustments

**1. [Rule 2 - Missing functionality] Added quoteServerId to uploadAudio FormData**
- **Found during:** Task 1
- **Issue:** Plan spec appended only the audio file to FormData; the server needs `quoteServerId` to link the upload to the correct quote record
- **Fix:** Added `formData.append('quoteServerId', quoteServerId)` after the audio blob append
- **Files modified:** `apps/mobile/src/api/voice.ts`

**2. [Rule 2 - Missing functionality] Suppressed console.warn eslint warning in sync-queue**
- **Found during:** Task 1
- **Issue:** Pre-existing `console.warn` for unhandled entity types would trigger lint error without eslint-disable comment
- **Fix:** Added `// eslint-disable-next-line no-console` before the console.warn
- **Files modified:** `apps/mobile/src/sync/sync-queue.ts`

**3. [Clarification] SafeAreaView insets handled via useSafeAreaInsets instead of Modal**
- Plan spec suggested `Modal` component but expo-router screen is preferred — implemented as a full-screen tab screen with hidden tab bar, which is cleaner with expo-router navigation

## Known Stubs

None. All data flows are wired:
- `uploadAudio` sends real FormData to the backend endpoint
- `getVoiceStatus` polls the real backend endpoint
- `ai_processing` quote creation is wired to WatermelonDB immediately
- Polling loop transitions quotes to `draft_local` or `failed_send` based on real API responses

## Self-Check: PASSED

- FOUND: apps/mobile/src/api/voice.ts
- FOUND: apps/mobile/src/db/migrations.ts
- FOUND: apps/mobile/src/components/voice/recording-waveform.tsx
- FOUND: apps/mobile/app/(app)/voice-record.tsx
- FOUND commit: b48f14e (Task 1)
- FOUND commit: 90075db (Task 2)
