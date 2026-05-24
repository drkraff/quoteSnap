# Phase 5: Voice-to-Quote Pipeline - Research

**Researched:** 2026-04-02
**Domain:** expo-av audio recording, Cloudflare R2, OpenAI Whisper + GPT-4o function calling, pg-boss job queue, React Native offline sync
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**D-01 — Dual FAB on Quotes tab**
- Bottom FAB: mic icon + "Voice Quote" label, solid `#0066cc`, primary action
- Above FAB: pen icon + "Manual" label, muted/outlined style
- No expanded/speed-dial/long-press pattern
- `paddingBottom` on FlatList `contentContainerStyle` to avoid FAB occlusion
- FAB container: `position: 'absolute'`, `bottom` = tab bar height + `useSafeAreaInsets()` bottom

**D-02 — Dedicated recording screen (not inline modal on draft screen)**
- Shows: large mic button, waveform/animated indicator, duration counter
- After Stop: modal dismisses, contractor returns to Quotes tab, new draft row appears with progress indicator

**D-03 — `ai_processing` row state in Quotes history**
- New quote status `ai_processing` between recording and `draft_local`
- Row shows spinner/progress bar instead of price while processing
- On completion: row updates to `draft_local`, in-app toast "Your quote is ready — tap to review"
- Reuse `UndoToast` component pattern (3 s, tappable, same bottom placement)
- No push notification (contractor is in-app)

**D-04 — Offline recording flow**
- Audio saved to `documentDirectory` immediately (before network check) — prevents Android cache eviction
- Sync queue entry (`entityType: 'audio'`) created immediately even offline
- Offline row shows "Queued" label (static), not a spinner
- When connectivity returns: queue uploads audio → Whisper → GPT-4o → `draft_local`

**D-05 — Confidence badge on LineItemRow**
- Text badge below item name inside `flex: 1` name column: "Review" (amber `#d97706`), "Needs Input" (red `#dc2626`)
- Left border stripe (3-4 pt) matching tier color — visual scanning aid
- `numberOfLines={1}` stays on name `Text`; badge is sibling `Text` below it in column layout
- Clean items (≥0.85): no badge, no border, no height change
- Flagged rows grow to ~72 pt (vs current 56 pt)
- Red items auto-scroll into view on draft load (VOICE-08)

**D-06 — Backend pipeline with pg-boss**
1. `POST /voice/upload` → stores audio in Cloudflare R2, creates pg-boss job, returns `jobId`
2. pg-boss worker: Whisper → GPT-4o function calling → ID validation → write draft line items → status → `draft_local` → delete audio from R2
3. Mobile polls `GET /voice/status/:jobId` at 1.5 s intervals

**D-07 — GPT-4o function calling constraint**
- System prompt returns only catalog item IDs + quantities — never free-text prices
- Backend validates every returned ID; non-catalog items rejected and flagged

**D-08 — Audio deleted from R2 immediately after Whisper transcription completes (PII)**

**D-09 — `ai_processing` added to WatermelonDB schema comment and Postgres CHECK constraint**
Full lifecycle: `ai_processing` → `draft_local` → `draft_queued` → `sent` → `approved | declined | expired | failed_send`

**Plan split**
- Plan 1: Backend voice pipeline (R2, pg-boss, Whisper, GPT-4o, polling endpoint, Postgres migration)
- Plan 2: Mobile recording UI (dual FAB, recording screen, expo-av, FileSystem.moveAsync, sync queue wiring, `ai_processing` row)
- Plan 3: Confidence display + integration (LineItemRow badge + border, auto-scroll, toast, offline queued state, E2E)

### Claude's Discretion

- Plan structure and wave organization within each plan
- Exact waveform animation technique (simple Animated pulse is fine; real waveform is over-engineering)
- GPT-4o function schema field names (must return catalogItemId + quantity + confidence score)
- Exact polling implementation (setInterval vs recursive setTimeout — prefer recursive setTimeout for cleanup safety)
- How confidence score flows from backend response JSON to WatermelonDB draft line item JSON

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| VOICE-01 | Contractor can record voice using in-app mic (expo-av) | expo-av Audio.Recording API confirmed; requires permissions setup |
| VOICE-02 | Audio buffer moved from cacheDirectory → documentDirectory immediately after recording stops | `expo-file-system` FileSystem.moveAsync confirmed for this purpose |
| VOICE-03 | Recorded audio uploaded via offline queue (works without signal) | Existing `enqueue()` + `pushToServer()` extension pattern; `entityType: 'audio'` already typed |
| VOICE-04 | Backend transcribes via Whisper, maps via GPT-4o function calling | `openai` npm package; Whisper `audio.transcriptions.create()`; GPT-4o `chat.completions.create()` with `tools` |
| VOICE-05 | GPT-4o constrained to return only catalog item IDs and quantities | Function schema design: tool returns `{ items: [{catalogItemId, quantity, confidence}] }` |
| VOICE-06 | Backend validates every returned ID against contractor's catalog; non-catalog items rejected | SQL `SELECT id FROM catalog_items WHERE contractor_id=$1 AND id=ANY($2) AND NOT is_archived` |
| VOICE-07 | AI draft returned to client via polling at 1.5 s intervals | `GET /voice/status/:jobId` endpoint; mobile recursive setTimeout loop |
| VOICE-08 | Confidence tiers applied: ≥0.85 clean, 0.60–0.84 "Review" amber, <0.60 "Needs Input" red + auto-scroll | LineItemRow extension; FlatList `scrollToIndex` on draft load |
| VOICE-09 | No raw confidence percentages shown — plain language labels only | Labels "Review" / "Needs Input" only; confidence stored in line_items_json, never rendered as number |
</phase_requirements>

---

## Summary

Phase 5 adds the core voice-to-quote pipeline: contractor taps a mic FAB, records a job description, audio is persisted and queued, then the backend transcribes with Whisper, maps to catalog via GPT-4o function calling, and returns a draft to the mobile client via polling. The draft screen already exists from Phase 4; this phase only adds the entry path and confidence badge rendering.

The architecture splits cleanly into three work packages: (1) backend services (new packages, new routes, new worker), (2) mobile recording UI (new screen, FAB refactor, sync queue extension), and (3) confidence rendering plus end-to-end wiring. All three depend on decisions already locked in CONTEXT.md — there are no open technical choices at the architecture level.

Key implementation risk is the expo-av permission and audio codec path on Android. The `Audio.Recording` API on Expo 52 requires `requestPermissionsAsync()` before recording and `prepareToRecordAsync()` with an explicit preset. The safest preset is `Audio.RecordingOptionsPresets.HIGH_QUALITY` (AAC, widely accepted by Whisper). The FileSystem move to `documentDirectory` must happen synchronously in the recording stop handler before any async operations.

**Primary recommendation:** Install `expo-av`, `expo-file-system`, `pg-boss`, `openai`, and `@aws-sdk/client-s3` first. Build backend pipeline (Plan 1) before mobile UI (Plan 2) so the polling endpoint exists when mobile polling is wired.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| expo-av | 16.0.8 (verified npm) | Audio recording on iOS/Android | Managed Expo workflow requirement; locked in PROJECT.md |
| expo-file-system | 18.0.x (compatible with Expo 52) | `FileSystem.moveAsync` from cacheDirectory → documentDirectory | Only Expo-managed way to access persistent document storage |
| openai | 6.33.0 (verified npm) | Whisper transcription + GPT-4o function calling | Official OpenAI Node SDK; works in Node 18+ |
| pg-boss | 12.15.0 (verified npm) | Job queue for async voice processing; already used for quote expiry cron | Already in PROJECT.md stack decision; avoids Redis dependency |
| @aws-sdk/client-s3 | 3.1023.0 (verified npm) | Cloudflare R2 upload/delete (R2 is S3-compatible) | Official AWS SDK; R2 uses S3 API with custom endpoint |
| multer | 2.1.1 (verified npm) | Multipart audio file upload on Express `POST /voice/upload` | Established Express multipart middleware |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @aws-sdk/s3-request-presigner | 3.1023.0 | Optional: presigned URLs for direct upload (not used in MVP) | Deferred — MVP uploads via backend |
| expo-constants | ~17.0.0 (already installed) | Read `expoConfig.extra` for API URL | Already in mobile deps |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| multer | busboy directly | multer is lighter abstraction over busboy; both are fine at MVP scale |
| @aws-sdk/client-s3 | aws4 + fetch | SDK handles retries, streaming, signing; hand-rolling adds risk |
| pg-boss polling | WebSockets | WebSockets explicitly out of scope per PROJECT.md |

**Installation — backend:**
```bash
cd apps/backend && npm install pg-boss openai @aws-sdk/client-s3 multer
npm install --save-dev @types/multer
```

**Installation — mobile:**
```bash
cd apps/mobile && npx expo install expo-av expo-file-system
```

> `npx expo install` resolves Expo-compatible versions automatically. Do not use `npm install` for Expo SDK packages — version mismatches cause native build failures.

**Version verification (performed 2026-04-02):**
- `pg-boss@12.15.0` — latest stable
- `openai@6.33.0` — latest stable
- `@aws-sdk/client-s3@3.1023.0` — latest stable
- `expo-av@16.0.8` — latest; expo install will pin to Expo 52 compat
- `expo-file-system@18.0.x` — expo install will resolve

---

## Architecture Patterns

### Recommended Project Structure (new files only)

```
apps/backend/src/
├── routes/voice.ts              # POST /voice/upload, GET /voice/status/:jobId
├── workers/voice-processor.ts   # pg-boss worker: Whisper → GPT-4o → validate → write draft
├── services/r2.ts               # R2 upload/delete helpers (S3Client wrapper)
├── db/migrations/004_voice.sql  # ai_processing status CHECK constraint

apps/mobile/app/(app)/
├── voice-record.tsx             # New recording screen (modal navigation)

apps/mobile/src/api/
├── voice.ts                     # uploadAudio(filePath, quoteId), pollVoiceStatus(jobId)

apps/mobile/src/utils/
├── confidence.ts                # confidenceTier(score): 'clean' | 'review' | 'needs_input'
```

### Pattern 1: expo-av Recording Flow

**What:** Record audio, stop, immediately move file to persistent storage.
**When to use:** VOICE-01, VOICE-02 — the only safe recording pattern on Android.

```typescript
// Source: expo-av official docs / Expo 52 compatible
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';

// Must call before first recording attempt
const { granted } = await Audio.requestPermissionsAsync();
if (!granted) { /* show FAIL-02 prompt */ return; }

await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });

const { recording } = await Audio.Recording.createAsync(
  Audio.RecordingOptionsPresets.HIGH_QUALITY
);

// On Stop tap:
await recording.stopAndUnloadAsync();
const uri = recording.getURI(); // points to cacheDirectory

// VOICE-02: move immediately to documentDirectory
const dest = FileSystem.documentDirectory + `audio-${quoteId}.m4a`;
await FileSystem.moveAsync({ from: uri!, to: dest });
// dest is now the stable path — enqueue with this path
```

**Critical:** `stopAndUnloadAsync()` must complete before `moveAsync`. Do not fire-and-forget.

### Pattern 2: pg-boss Worker

**What:** Register a named job queue, send a job, process with a typed handler.
**When to use:** D-06 backend pipeline.

```typescript
// Source: pg-boss v12 docs
import PgBoss from 'pg-boss';

const boss = new PgBoss(process.env.DATABASE_URL!);
await boss.start();

// Send from upload route:
const jobId = await boss.send('voice-process', {
  quoteId,
  contractorId,
  r2Key,
  audioPath, // temp path if streaming — or just r2Key
});

// Worker registration:
await boss.work<VoiceJobData>('voice-process', { teamSize: 2 }, async (job) => {
  // job.data = { quoteId, contractorId, r2Key }
  await processVoiceJob(job.data);
});
```

**Note:** pg-boss v12 uses `boss.work()` (not `boss.subscribe()`). The `teamSize` option allows concurrent workers. `boss.start()` must be awaited before `boss.send()` or `boss.work()`.

### Pattern 3: GPT-4o Function Calling — Catalog Constraint

**What:** Constrain GPT-4o to return only catalog item IDs via tool/function schema.
**When to use:** VOICE-04, VOICE-05, D-07.

```typescript
// Source: OpenAI Node SDK v6 docs
import OpenAI from 'openai';
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Catalog items fetched from DB before calling GPT
const catalogItems = await getCatalogForContractor(contractorId);

const completion = await openai.chat.completions.create({
  model: 'gpt-4o',
  messages: [
    {
      role: 'system',
      content: `You are a trade quoting assistant. Map the job description to items from this catalog only.
Catalog: ${JSON.stringify(catalogItems.map(i => ({ id: i.id, name: i.name, unit: i.unit })))}
Return ONLY items that exist in this catalog. Use the exact catalog IDs.`,
    },
    { role: 'user', content: transcript },
  ],
  tools: [
    {
      type: 'function',
      function: {
        name: 'create_quote_items',
        description: 'Return the line items for this quote',
        parameters: {
          type: 'object',
          properties: {
            items: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  catalogItemId: { type: 'string', description: 'ID from the provided catalog' },
                  quantity: { type: 'integer', minimum: 1 },
                  confidence: { type: 'number', minimum: 0, maximum: 1,
                    description: 'How confident you are this item belongs in the quote' },
                },
                required: ['catalogItemId', 'quantity', 'confidence'],
              },
            },
          },
          required: ['items'],
        },
      },
    },
  ],
  tool_choice: { type: 'function', function: { name: 'create_quote_items' } },
});

const toolCall = completion.choices[0]?.message.tool_calls?.[0];
const result = JSON.parse(toolCall!.function.arguments) as { items: AILineItem[] };
```

**Backend ID validation (VOICE-06):**
```typescript
const returnedIds = result.items.map(i => i.catalogItemId);
const validRows = await query(
  `SELECT id FROM catalog_items WHERE contractor_id=$1 AND id=ANY($2) AND NOT is_archived`,
  [contractorId, returnedIds]
);
const validIds = new Set(validRows.rows.map((r: { id: string }) => r.id));
const validatedItems = result.items.filter(i => validIds.has(i.catalogItemId));
// validatedItems only — non-catalog items silently dropped per D-07
```

### Pattern 4: Cloudflare R2 Upload/Delete

**What:** Upload audio to R2 using S3-compatible API; delete after transcription.
**When to use:** D-06, D-08.

```typescript
// Source: AWS SDK v3 docs; R2 uses S3 API with custom endpoint
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

// Upload from multer buffer
await r2.send(new PutObjectCommand({
  Bucket: process.env.R2_BUCKET!,
  Key: r2Key,   // e.g. `audio/${contractorId}/${jobId}.m4a`
  Body: req.file.buffer,
  ContentType: 'audio/mp4',
}));

// Delete after transcription (D-08)
await r2.send(new DeleteObjectCommand({ Bucket: process.env.R2_BUCKET!, Key: r2Key }));
```

### Pattern 5: Mobile Polling Loop

**What:** Recursive setTimeout poll at 1.5 s intervals until complete, failed, or screen unmounted.
**When to use:** VOICE-07, D-06.

```typescript
// Source: established React Native pattern
const MAX_POLLS = 40; // 60 seconds max — protect against runaway polling

async function pollStatus(jobId: string, quoteLocalId: string, attempt = 0): Promise<void> {
  if (attempt >= MAX_POLLS) {
    // Mark as failed, show error row
    return;
  }
  const result = await getVoiceStatus(jobId); // GET /voice/status/:jobId
  if (result.status === 'complete' && result.draftId) {
    // Update WatermelonDB quote status to draft_local
    // Show toast
    return;
  }
  if (result.status === 'failed') {
    // Mark quote row as failed
    return;
  }
  // Continue polling
  pollTimerRef.current = setTimeout(() => {
    void pollStatus(jobId, quoteLocalId, attempt + 1);
  }, 1500);
}

// Cleanup on unmount:
useEffect(() => () => {
  if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
}, []);
```

### Pattern 6: LineItemRow Confidence Badge

**What:** Add optional `confidence` prop to `LineItemRow`, render badge below name.
**When to use:** VOICE-08, VOICE-09, D-05.

```typescript
// Extends existing LineItemRow in apps/mobile/src/components/quotes/line-item-row.tsx
type ConfidenceTier = 'review' | 'needs_input';

interface LineItemRowProps {
  // ... existing props ...
  confidence?: ConfidenceTier; // undefined = clean (no badge)
}

// Inside row View — add left border:
const tierBorderColor = confidence === 'needs_input' ? '#dc2626'
  : confidence === 'review' ? '#d97706'
  : 'transparent';

// Inside name column View (flexDirection: 'column'):
{confidence && (
  <Text style={confidence === 'needs_input' ? styles.badgeRed : styles.badgeAmber}>
    {confidence === 'needs_input' ? 'Needs Input' : 'Review'}
  </Text>
)}

// Row minHeight: confidence ? 72 : 56
```

### Pattern 7: Auto-scroll to First Red Item

**What:** On draft screen load, scroll FlatList to first `needs_input` item.
**When to use:** VOICE-08, D-05.

```typescript
// After lineItems are loaded and rendered:
const flatListRef = useRef<FlatList>(null);

useEffect(() => {
  if (lineItems.length === 0) return;
  const firstRedIndex = lineItems.findIndex(
    item => confidenceTier(item.confidence) === 'needs_input'
  );
  if (firstRedIndex > 0) {
    // Small delay to let FlatList render
    setTimeout(() => {
      flatListRef.current?.scrollToIndex({
        index: firstRedIndex,
        animated: true,
        viewPosition: 0.3,
      });
    }, 300);
  }
}, [lineItems]);
```

**Note:** `scrollToIndex` can throw if the index is out of range or list hasn't measured. Wrap in try/catch or use `onScrollToIndexFailed` handler.

### Pattern 8: `ai_processing` Row in Quotes History

**What:** QuoteRow component handles `ai_processing` status with spinner instead of price.
**When to use:** D-03, D-04.

```typescript
// In QuoteRow (apps/mobile/src/components/quotes/quote-row.tsx):
// Status 'ai_processing' + isOnline → show ActivityIndicator
// Status 'ai_processing' + !isOnline → show "Queued" label (static Text)
// Other statuses → unchanged rendering
```

### Anti-Patterns to Avoid

- **`npm install expo-av`** instead of `npx expo install expo-av` — Expo SDK packages must be installed via `expo install` to get the correct peer-pinned version for Expo 52.
- **Recording without `Audio.setAudioModeAsync`** — On iOS, `allowsRecordingIOS: true` must be set or `createAsync` silently fails.
- **Moving audio file with `copyAsync` instead of `moveAsync`** — `copyAsync` leaves the original in cacheDirectory, which Android may evict. Use `moveAsync` (VOICE-02).
- **`boss.publish()` in pg-boss v12** — Method was renamed to `boss.send()` in v9+. Training data may reference old API.
- **Polling with `setInterval` without cleanup** — Use recursive `setTimeout` with a ref so cleanup on unmount is deterministic.
- **Storing raw confidence float in WatermelonDB** — Store `confidence` as part of `line_items_json` (extend `LineItem` type with optional `confidence?: number`); do not add a new WatermelonDB column.
- **Making `quote_line_items` store confidence** — The Postgres `quote_line_items` table is for sent quotes (snapshot model). AI draft confidence belongs in the draft's `line_items_json` only.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| AI job queue | Custom Postgres polling loop | pg-boss | Job state, retry, concurrency, dead-letter all built in |
| Audio file multipart upload | Manual `Content-Type: multipart/form-data` parsing | multer | Handles boundary parsing, file size limits, temp storage |
| Whisper integration | Direct HTTP to api.openai.com | `openai` npm SDK | SDK handles auth headers, retries, type safety |
| R2/S3 signing | AWS Signature V4 by hand | `@aws-sdk/client-s3` | Signing is subtle; AWS SDK is battle-tested |
| Confidence tier logic | Inline comparisons throughout | `confidenceTier()` util function | Single source of truth for tier boundaries |
| `expo-av` permissions on Android | Manual `PermissionsAndroid.request()` | `Audio.requestPermissionsAsync()` | expo-av wraps both platforms uniformly |

**Key insight:** The job queue is the most risky component to hand-roll. pg-boss handles exactly-once semantics, failed job retry, and status tracking — all required for this pipeline.

---

## Common Pitfalls

### Pitfall 1: pg-boss Not Started Before Route Handlers Run

**What goes wrong:** `POST /voice/upload` calls `boss.send()` before `boss.start()` resolves, causing "boss not started" errors.
**Why it happens:** `boss.start()` is async and connects to Postgres; Express binds routes synchronously.
**How to avoid:** Start pg-boss before `app.listen()`. In `index.ts`, await `boss.start()` before starting the HTTP server. Pass the `boss` instance via dependency injection or module singleton.
**Warning signs:** `Error: boss not started` in logs on first voice upload attempt.

### Pitfall 2: expo-av Recording on iOS Without Audio Mode Set

**What goes wrong:** `Audio.Recording.createAsync()` returns successfully but records silence; audio sent to Whisper produces empty transcript.
**Why it happens:** iOS requires `allowsRecordingIOS: true` in audio mode or the microphone is muted for the session.
**How to avoid:** Always call `Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true })` before `createAsync`. Reset mode after recording stops.
**Warning signs:** Whisper returns empty or trivial transcript on iOS only; Android works fine.

### Pitfall 3: Android Cache Eviction Before FileSystem.moveAsync

**What goes wrong:** App goes to background while recording; Android reclaims cacheDirectory file before `moveAsync` runs; audio is lost.
**Why it happens:** Android can evict cacheDirectory contents when memory pressure is high.
**How to avoid:** Call `moveAsync` immediately in the `stopAndUnloadAsync()` callback — before any state updates, navigation, or async API calls.
**Warning signs:** Occasional "file not found" errors on `moveAsync` on low-memory devices.

### Pitfall 4: GPT-4o Returns Catalog IDs Not in Contractor's Actual Catalog

**What goes wrong:** GPT "invents" an ID or hallucinates a plausible-looking UUID; backend doesn't validate; line item with unknown ID reaches the client.
**Why it happens:** GPT-4o system prompt reduces (but doesn't eliminate) hallucination risk. Validation must be in code, not just prompt.
**How to avoid:** D-06/VOICE-06 — SQL validation step is mandatory, not optional. Every returned ID must be confirmed in the contractor's non-archived catalog before writing draft line items.
**Warning signs:** Draft contains items with IDs not found in `catalog_items` table.

### Pitfall 5: Polling Loop Continuing After Screen Unmount

**What goes wrong:** Contractor navigates away from Quotes tab; polling continues firing; state updates on unmounted component cause React warnings or stale closure bugs.
**Why it happens:** `setTimeout` callbacks hold closures over stale state.
**How to avoid:** Store timer in a `useRef`. In `useEffect` cleanup, call `clearTimeout(pollTimerRef.current)`. The polling logic should check a mounted ref before calling `setState`.
**Warning signs:** "Can't perform a React state update on an unmounted component" warnings.

### Pitfall 6: FlatList `scrollToIndex` Crash on First Render

**What goes wrong:** `flatListRef.current?.scrollToIndex()` throws because FlatList hasn't measured all items yet.
**Why it happens:** FlatList measures items lazily; calling scrollToIndex before items render causes an out-of-range error.
**How to avoid:** Wrap in a short `setTimeout` (200–300 ms) to defer after first render. Provide `onScrollToIndexFailed` handler that falls back to `scrollToOffset`.
**Warning signs:** Red screen crash on draft load when first red item is not visible.

### Pitfall 7: `ai_processing` Status Missing from Postgres CHECK Constraint

**What goes wrong:** Backend tries to INSERT a quote with status `ai_processing`; Postgres rejects with constraint violation; upload endpoint returns 500.
**Why it happens:** `003_quotes.sql` does not define a CHECK constraint on status — but if one is added in `004_voice.sql` or via an ALTER TABLE, it must include all valid values including `ai_processing`.
**How to avoid:** Migration `004_voice.sql` adds `ai_processing` to the status column documentation (the schema currently uses VARCHAR with no CHECK constraint — so the real risk is the comment/WatermelonDB schema comment being inconsistent). Verify migration runs before testing.
**Warning signs:** Quote rows created with `ai_processing` status don't appear in the history query (if query filters by status list).

### Pitfall 8: `multer` File Size Limit

**What goes wrong:** Contractor records a long voice description (2+ minutes); upload is rejected silently by multer's default 1 MB limit.
**Why it happens:** multer defaults to 1 MB if no limit is configured.
**How to avoid:** Set explicit limit: `multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } })` — 25 MB covers ~30 minutes of AAC. Whisper API limit is 25 MB.
**Warning signs:** Upload returns 413 or multer rejects silently; no audio in R2.

---

## Code Examples

### New Backend: POST /voice/upload skeleton

```typescript
// apps/backend/src/routes/voice.ts
import { Router, Request, Response } from 'express';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import { authenticateToken } from '../middleware/auth.js';
import { r2 } from '../services/r2.js';
import { boss } from '../workers/voice-processor.js';
import { PutObjectCommand } from '@aws-sdk/client-s3';

export const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

router.post('/upload', authenticateToken, upload.single('audio'), async (req: Request, res: Response): Promise<void> => {
  try {
    const contractorId = req.contractor!.contractorId;
    const { quoteId } = req.body as { quoteId: string };
    if (!req.file) { res.status(400).json({ error: 'No audio file' }); return; }

    const r2Key = `audio/${contractorId}/${uuidv4()}.m4a`;
    await r2.send(new PutObjectCommand({
      Bucket: process.env['R2_BUCKET']!,
      Key: r2Key,
      Body: req.file.buffer,
      ContentType: req.file.mimetype,
    }));

    const jobId = await boss.send('voice-process', { quoteId, contractorId, r2Key });
    res.status(202).json({ jobId });
  } catch (err) {
    console.error('POST /voice/upload error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});
```

### New Backend: pg-boss initialization as singleton

```typescript
// apps/backend/src/workers/voice-processor.ts
import PgBoss from 'pg-boss';

// Singleton — imported by index.ts and routes/voice.ts
export let boss: PgBoss;

export async function initBoss(): Promise<void> {
  boss = new PgBoss(process.env['DATABASE_URL']!);
  boss.on('error', (err) => console.error('pg-boss error:', err));
  await boss.start();
  await boss.work<VoiceJobData>('voice-process', { teamSize: 2 }, processVoiceJob);
}
```

### New Migration: 004_voice.sql

```sql
-- Add ai_processing to the status comment only (no CHECK constraint currently)
-- Document the full lifecycle in the column comment
COMMENT ON COLUMN quotes.status IS
  'draft_local | draft_queued | sent | approved | declined | expired | failed_send | ai_processing';

-- Add job_id column to quotes for polling
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS voice_job_id VARCHAR(50);
```

### Mobile: LineItem type extension

```typescript
// apps/mobile/src/utils/line-items.ts — extend LineItem interface
export interface LineItem {
  catalogItemId: string;
  name: string;
  quantity: number;
  unitPriceCents: number;
  confidence?: number; // 0–1, stored by AI pipeline only; undefined = manually added
}

// New utility:
export type ConfidenceTier = 'clean' | 'review' | 'needs_input';

export function confidenceTier(confidence: number | undefined): ConfidenceTier {
  if (confidence === undefined) return 'clean';
  if (confidence >= 0.85) return 'clean';
  if (confidence >= 0.60) return 'review';
  return 'needs_input';
}
```

### Mobile: sync queue audio case in pushToServer

```typescript
// apps/mobile/src/sync/sync-queue.ts — add to pushToServer():
if (item.entityType === 'audio') {
  const { filePath, quoteId } = payload as { filePath: string; quoteId: string; quoteLocalId: string };
  // uploadAudio reads file from documentDirectory, POSTs to /voice/upload
  const { jobId } = await uploadAudio(filePath, quoteId);
  // Store jobId on quote record for polling
  const quoteCollection = database.get<Quote>('quotes');
  const localItems = await quoteCollection.query(Q.where('id', item.entityId)).fetch();
  if (localItems[0]) {
    await database.write(async () => {
      await localItems[0].update((r) => {
        r.voiceJobId = jobId; // new field — requires schema bump
      });
    });
  }
  return;
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `boss.subscribe()` | `boss.work()` | pg-boss v9 (2022) | `subscribe` still works as alias but `work` is canonical |
| `boss.publish()` | `boss.send()` | pg-boss v9 | `publish` removed in v10 |
| expo-av `Audio.Recording.prepareToRecordAsync` | `Audio.Recording.createAsync` (convenience wrapper) | SDK 44+ | `createAsync` is the modern one-step API; `prepareToRecordAsync` still works |
| OpenAI `Configuration` + `OpenAIApi` (v3) | `new OpenAI()` (v4+) | openai@4.0 (2023) | Old `Configuration` class removed; v6 is current |
| GPT function calling via `functions` array | Tool calling via `tools` array | GPT-4o launch | `functions` deprecated; use `tools` with `type: 'function'` |

**Deprecated/outdated:**
- `openai` v3 `Configuration`/`OpenAIApi` pattern: fully removed in v4+. Any tutorial using `new Configuration({})` is outdated.
- `boss.publish()`: removed in pg-boss v10. Use `boss.send()`.
- `Audio.RecordingOptionsPresets.LOW_QUALITY`: exists but produces low-bitrate audio that Whisper handles worse. Use `HIGH_QUALITY`.

---

## Open Questions

1. **WatermelonDB schema version bump for `voice_job_id` field**
   - What we know: The Quote model needs a `voiceJobId` field to store the pg-boss job ID for polling. WatermelonDB schema version bumps require a migration.
   - What's unclear: Whether `voiceJobId` should be optional (undefined for manual quotes) vs. always present.
   - Recommendation: Add as `isOptional: true` string column. Bump schema version to 2. WatermelonDB migrations use `addColumns` — no data loss risk.

2. **How confidence flows from draft to draft review screen**
   - What we know: Confidence is stored in `line_items_json` as an optional field on `LineItem`. The draft screen passes `LineItem` objects to `LineItemRow`.
   - What's unclear: Should the draft screen strip `confidence` from line items when the contractor manually edits them (so edited items don't show stale confidence badges)?
   - Recommendation: Yes — clear `confidence` when contractor edits quantity or price for an item, since AI confidence no longer applies to a manually-adjusted value.

3. **R2 credentials not yet in `.env`**
   - What we know: `.env.example` has no R2 or OpenAI keys.
   - What's unclear: Whether R2 bucket and API keys are already provisioned.
   - Recommendation: Plan 1 Wave 0 must include adding `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, and `OPENAI_API_KEY` to `.env.example` and `.env`. Backend will not start the voice route without these.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Backend build/run | ✓ | 22.15.0 | — |
| npm | Package install | ✓ | 10.9.2 | — |
| Docker | Postgres (dev) | ✓ | 28.3.2 | — |
| pg-boss | Backend job queue | ✗ | not installed | — (must install) |
| openai | Whisper + GPT-4o | ✗ | not installed | — (must install) |
| @aws-sdk/client-s3 | Cloudflare R2 | ✗ | not installed | — (must install) |
| multer | Audio upload | ✗ | not installed | — (must install) |
| expo-av | Mobile recording | ✗ | not installed | — (must install via expo install) |
| expo-file-system | FileSystem.moveAsync | ✗ | not installed | — (must install via expo install) |
| Cloudflare R2 bucket | Audio storage | ✗ (unverified) | — | — (must provision before Plan 1) |
| OpenAI API key | Whisper + GPT-4o | ✗ (unverified) | — | — (must provision before Plan 1) |

**Missing dependencies with no fallback:**
- `pg-boss`, `openai`, `@aws-sdk/client-s3`, `multer` — backend installs; Plan 1 Wave 0
- `expo-av`, `expo-file-system` — mobile installs; Plan 2 Wave 0
- Cloudflare R2 bucket + API credentials — external provisioning required; block Plan 1
- OpenAI API key — external provisioning required; block Plan 1

**Missing dependencies with fallback:**
- None at MVP scope.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | jest-expo (already configured) |
| Config file | `apps/mobile/jest.config.js` |
| Quick run command | `cd apps/mobile && npm test -- --testPathPattern=utils` |
| Full suite command | `cd apps/mobile && npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| VOICE-05 | GPT-4o returns only catalog IDs; validation rejects unknown IDs | unit | `cd apps/mobile && npm test -- --testPathPattern=confidence` | ❌ Wave 0 |
| VOICE-08 | `confidenceTier()` maps score to correct tier label | unit | `cd apps/mobile && npm test -- --testPathPattern=confidence` | ❌ Wave 0 |
| VOICE-09 | No raw percentage rendered; only 'Review'/'Needs Input' labels | unit | `cd apps/mobile && npm test -- --testPathPattern=confidence` | ❌ Wave 0 |
| VOICE-01 | Recording starts/stops without crash | manual (native audio) | Device/simulator only | manual-only |
| VOICE-02 | File exists in documentDirectory after recording stops | manual (filesystem) | Device only | manual-only |
| VOICE-03 | Offline audio queue entry created; processed on reconnect | manual (network toggle) | Device only | manual-only |
| VOICE-04 | Transcript + draft returned correctly | integration (requires API keys) | Postman/curl | manual-only |
| VOICE-06 | Backend rejects non-catalog IDs | unit (backend) | `cd apps/backend && npx tsx src/workers/voice-processor.test.ts` | ❌ Wave 0 |
| VOICE-07 | Polling returns correct status | integration | curl `GET /voice/status/:id` | manual-only |

**Justification for manual-only tests:** VOICE-01, VOICE-02, VOICE-03 require native audio hardware or filesystem; not mockable in jest-expo. VOICE-04, VOICE-07 require live API keys and network.

### Sampling Rate

- **Per task commit:** `cd apps/mobile && npm test -- --testPathPattern=confidence`
- **Per wave merge:** `cd apps/mobile && npm test`
- **Phase gate:** Full suite green + manual device verification before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `apps/mobile/src/utils/confidence.test.ts` — covers VOICE-08, VOICE-09 (confidenceTier function)
- [ ] `apps/backend/src/workers/voice-processor.test.ts` — covers VOICE-06 (catalog ID validation logic as pure function)

---

## Project Constraints (from CLAUDE.md)

The following directives from the global CLAUDE.md apply to this phase:

| Directive | Impact on Phase 5 |
|-----------|-------------------|
| TypeScript always, no `any` | All new files: voice.ts, voice-processor.ts, voice.ts (mobile), confidence.ts must be fully typed |
| No `console.log` on main | Use `console.error` in catch blocks only; remove any debug logs before commit |
| Error handling required on all async | Every `await` in voice pipeline needs try/catch; sync queue `pushToServer` audio case must throw on failure |
| `npm run build` after each session | Backend: `cd apps/backend && npm run build`; mobile: `cd apps/mobile && npx expo export --platform android` (or just tsc check) |
| No magic strings | `'voice-process'` queue name, `'audio'` entity type, status strings should be `const` values |
| kebab-case files | `voice-record.tsx`, `voice-processor.ts`, `r2.ts`, `confidence.ts` — all kebab-case |
| PascalCase components | `VoiceRecordScreen` default export in `voice-record.tsx` |
| UI work: invoke UI UX Pro Max skill first | Plan 3 (confidence display + recording screen UI) must invoke the skill before implementing LineItemRow badge and FAB changes |
| React components: wait for 21st.dev link or ask | Recording screen and dual FAB are new UI components — ask user before hand-rolling |
| `useSafeAreaInsets()` for FAB positioning | Already confirmed in existing `quotes.tsx`; pattern is established |
| Prices as integer cents | Confidence scores are floats (0–1); not prices. No conflict. |
| Audio deleted from R2 post-transcription | Enforced in pg-boss worker, not optional |

---

## Sources

### Primary (HIGH confidence)

- Existing codebase: `apps/mobile/src/sync/sync-queue.ts` — confirmed `entityType: 'audio'` already typed; `pushToServer` needs audio case
- Existing codebase: `apps/mobile/src/db/schema.ts` — confirmed `audio` comment in sync_queue_items; WatermelonDB schema version is 1
- Existing codebase: `apps/mobile/app/(app)/quotes.tsx` — confirmed single FAB pattern; needs dual-FAB refactor
- Existing codebase: `apps/mobile/src/components/quotes/line-item-row.tsx` — confirmed structure for confidence badge extension
- Existing codebase: `apps/backend/src/index.ts` — confirmed no pg-boss or voice route; both need adding
- Existing codebase: `apps/backend/src/db/migrations/003_quotes.sql` — confirmed no CHECK constraint on status; `ai_processing` comment-only addition is safe
- npm registry: `npm view pg-boss version` → 12.15.0 (2026-04-02)
- npm registry: `npm view openai version` → 6.33.0 (2026-04-02)
- npm registry: `npm view @aws-sdk/client-s3 version` → 3.1023.0 (2026-04-02)
- npm registry: `npm view expo-av version` → 16.0.8 (2026-04-02)
- npm registry: `npm view expo-file-system version` → 18.0.x (2026-04-02)
- npm registry: `npm view multer version` → 2.1.1 (2026-04-02)

### Secondary (MEDIUM confidence)

- pg-boss v12 API (`boss.work()`, `boss.send()`) — confirmed from dist-tags showing latest is 12.15.0; `work` is documented API since v9
- OpenAI `tools` array pattern for function calling — confirmed from openai@6 API; `functions` is deprecated
- expo-av `Audio.Recording.createAsync` pattern — confirmed as current Expo 52 API; `prepareToRecordAsync` is legacy but still works

### Tertiary (LOW confidence)

- GPT-4o `confidence` score stability — GPT-4o will return confidence values when asked via function schema, but exact calibration of 0.60/0.85 thresholds is untested against real voice samples. Thresholds are locked in REQUIREMENTS.md as product decisions.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all versions verified against npm registry 2026-04-02
- Architecture: HIGH — all patterns derived from existing codebase + locked CONTEXT.md decisions
- Pitfalls: HIGH for Android/expo-av and pg-boss API (common known issues); MEDIUM for GPT-4o confidence calibration

**Research date:** 2026-04-02
**Valid until:** 2026-05-02 (stable stack; OpenAI model API is fast-moving — re-verify if > 30 days)
