---
phase: 05-voice-to-quote-pipeline
plan: 01
subsystem: backend
tags: [voice, ai, pg-boss, whisper, gpt4o, r2, audio, pipeline]
dependency-graph:
  requires: [apps/backend/src/db/migrations/003_quotes.sql, apps/backend/src/routes/quotes.ts]
  provides: [POST /voice/upload, GET /voice/status/:jobId, pg-boss voice-process worker]
  affects: [apps/backend/src/index.ts, apps/backend/package.json]
tech-stack:
  added: [pg-boss@12, openai@6, @aws-sdk/client-s3@3, multer@2]
  patterns: [pg-boss WorkHandler batch pattern, GPT-4o function calling with tool_choice, R2 S3Client via @aws-sdk/client-s3]
key-files:
  created:
    - apps/backend/src/types/voice.ts
    - apps/backend/src/services/r2.ts
    - apps/backend/src/db/migrations/004_voice.sql
    - apps/backend/src/workers/voice-processor.ts
    - apps/backend/src/routes/voice.ts
  modified:
    - apps/backend/src/index.ts
    - apps/backend/.env.example
    - apps/backend/package.json
decisions:
  - "pg-boss WorkHandler receives Job[] (batch array), not a single Job — localConcurrency: 2 used instead of teamSize"
  - "ChatCompletionMessageToolCall is a union type; cast to ChatCompletionMessageFunctionToolCall to access .function.arguments"
  - "getFromR2 helper added to r2.ts to fetch audio buffer from R2 for Whisper — not in original plan spec but required by worker"
  - "package.json type=module added to fix pre-existing migrate.ts build failure (import.meta.url with NodeNext module)"
metrics:
  duration: 10m
  completed: "2026-04-03"
  tasks: 2
  files: 7
---

# Phase 05 Plan 01: Backend Voice-to-Quote Pipeline Summary

Backend voice pipeline implemented: audio upload to Cloudflare R2, pg-boss job queue, Whisper transcription, GPT-4o catalog-constrained mapping with function calling, backend ID validation, draft quote creation, and polling status endpoint.

## Tasks Completed

| Task | Description | Commit |
|------|-------------|--------|
| 1 | Types, R2 service, migration, env vars, dependencies | f74796c |
| 2 | pg-boss worker, voice routes, server wiring | f8610e3 |

## What Was Built

**POST /voice/upload** — Accepts multipart audio (max 25MB), creates an `ai_processing` quote, uploads audio to R2, sends a pg-boss `voice-process` job, and returns 202 with `{ jobId, quoteId }`.

**pg-boss worker (voice-processor.ts)** — Full pipeline:
1. Fetches audio from R2 via GetObjectCommand
2. Transcribes via `openai.audio.transcriptions.create` (Whisper-1)
3. Deletes audio from R2 immediately (PII compliance, D-08)
4. Fetches contractor's active catalog items
5. Calls GPT-4o with function calling (`create_quote_items` tool) constrained to catalog IDs
6. Validates all returned IDs against the DB (rejects non-catalog IDs)
7. Inserts `quote_line_items` rows and updates quote status to `draft_local` in a single transaction

**GET /voice/status/:jobId** — Polls pg-boss for job state, maps to `processing | complete | failed`, returns `draftId` (quoteId) on complete. Ownership check ensures contractor can only poll their own jobs.

**Migration 004_voice.sql** — Adds `voice_job_id VARCHAR(50)` column to quotes table.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Pre-existing `migrate.ts` TypeScript build failure**
- **Found during:** Overall verification (`npm run build`)
- **Issue:** `migrate.ts` uses `import.meta.url` but `package.json` lacked `"type": "module"`, causing TS1470 error with NodeNext module resolution
- **Fix:** Added `"type": "module"` to `apps/backend/package.json`
- **Files modified:** `apps/backend/package.json`
- **Commit:** f8610e3

**2. [Rule 1 - Bug] pg-boss API differences from plan spec**
- **Found during:** Task 2 TypeScript compilation
- **Issues:**
  - `teamSize` option does not exist — replaced with `localConcurrency: 2`
  - `WorkHandler` receives `Job[]` batch array, not single Job — added `processVoiceJobs` wrapper
  - `getJobById` requires queue name as first argument: `getJobById('voice-process', jobId)`
  - `ChatCompletionMessageToolCall` is a union type — narrowed via cast to `ChatCompletionMessageFunctionToolCall`
- **Fix:** Updated types and API calls to match actual pg-boss v12 and openai v6 interfaces
- **Files modified:** `apps/backend/src/workers/voice-processor.ts`, `apps/backend/src/routes/voice.ts`
- **Commit:** f8610e3

**3. [Rule 2 - Missing functionality] `getFromR2` helper not in plan spec**
- **Found during:** Task 2 implementation
- **Issue:** Worker needs to fetch audio from R2 before transcription, but plan spec only defined `uploadToR2` and `deleteFromR2` in r2.ts
- **Fix:** Added `getFromR2(key: string): Promise<Buffer>` to r2.ts using GetObjectCommand and stream-to-buffer conversion
- **Files modified:** `apps/backend/src/services/r2.ts`
- **Commit:** f74796c

## Known Stubs

None — all pipeline components are fully wired.

## Self-Check: PASSED

All created files exist on disk. Both commits (f74796c, f8610e3) verified in git log. TypeScript compiles with zero errors (`npx tsc --noEmit` exits 0). `npm run build` exits 0.
