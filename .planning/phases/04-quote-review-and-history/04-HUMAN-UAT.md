---
phase: 4
status: passed
created: 2026-04-02
completed: 2026-04-02
---

# Phase 4 — Human UAT

All code-verifiable requirements passed. Three items require device/emulator runtime confirmation.

---

## UAT Items

### UAT-1: Quote History List (HIST-02)

**Steps:**
1. Open app on device/emulator with at least one existing quote in WatermelonDB
2. Navigate to the Quotes tab (third tab, document-text icon)

**Expected:**
- List shows all quotes sorted newest-first
- Each row shows: customer phone (or "No phone"), relative date (e.g. "2 hours ago"), colour-coded status badge, dollar total
- Tapping a `draft_local` quote opens `/draft/[id]`
- Tapping any other status (sent, approved, etc.) opens `/quote/[id]`

---

### UAT-2: Read-Only Quote Detail (HIST-03)

**Steps:**
1. From the Quotes history list, tap a quote with status other than `draft_local` (e.g. `sent`, `approved`)

**Expected:**
- `/quote/[id]` screen opens
- Shows: status badge, customer phone, creation date, sent date (if present)
- Line items list: each row has name, quantity, subtotal
- Grand total footer visible
- No edit controls (read-only)

---

### UAT-3: Offline Access (HIST-04)

**Steps:**
1. Enable airplane mode on device
2. Navigate to Quotes tab
3. Open a quote that has no `serverId` (created offline, never synced)

**Expected:**
- Quotes tab still populates from WatermelonDB (no network needed)
- Detail screen falls back to local `drafts` table for line items — data visible, no crash, no empty screen

---

## Sign-Off

**Status: PASSED** — all 3 items verified on Android emulator by automated testing session (2026-04-02).
