# FAU-65 Progress

## Status: Complete (revision done)

## Session 1: Initial Implementation (complete)

All 19 features from the design document implemented — layout V2, persistence, export.

## Session 2: Review Fixes

Addressed all 17 violations from cubic-dev-ai review:

### App.tsx
- **#1 (P1) Missing avv-component shape**: False positive — codebase fully migrated to avv-page shapes. No fix needed.
- **#2 (P2) Unbounded serverMessages**: Replaced array with `LatestMessage` (msg + monotonic seq counter).
- **#3 (P2) Non-reactive zoom**: Extracted `ZoomControls` component using tldraw `useValue` hook.

### RightPanel.tsx
- **#4 (P2) Stale hasStarted**: Removed restoration from persisted sessionId. First message always uses `generate`.
- **#5 (P1) Batched messages dropped**: Track `lastProcessedSeqRef` to ensure every message processed exactly once.
- **#11 (P1) XSS via allow-scripts**: Removed from option preview iframe (`sandbox=""`). PagePreview retains it for Tailwind CDN + height reporter (no `allow-same-origin`, so scripts can't escape).

### TopBar.tsx
- **#15 (P3) Toast timer overlap**: `useRef` + `clearTimeout` before new timer.
- **#16 (P2) HTML false success**: `exportAsHtml` returns boolean; TopBar checks it.
- **#17 (P2) PNG false success**: `exportAsPng` returns `Promise<boolean>`; TopBar checks it.

### LeftSidebar.tsx
- **#10 (P2) In-place sort**: Changed to `[...page.sections].sort(...)`.

### export.ts
- **#12 (P2) Immediate blob URL revocation**: Added 1s delay via `setTimeout`.
- **#13 (P2) exportAsPng returns void**: Both export functions return boolean. Removed `alert()` calls.

### parse-sections.ts
- **#9 (P2) No validation**: Added `isValidSection` type guard checking `id`, `name`, `status`, `order`.

### session-persistence.ts
- **#14 (P2) No validation**: Runtime validation of session shape, chatHistory items, mode enum.

### Design doc violations (#6, #7, #8)
- Same as TopBar/LeftSidebar fixes. #8 (timestamp conflict) already fixed in session 1.

## Verification
- `pnpm build` — passes
- `pnpm type-check` — passes
- `bun test` — 37/37 pass

## What's left to do
Nothing — all review violations addressed. Ready for re-review.
