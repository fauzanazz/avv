# FAU-65 Progress

## Status: Complete (all reviews addressed)

## Session 1: Initial Implementation (complete)

All 19 features from the design document implemented — layout V2, persistence, export.

## Session 2: Review Fixes (first review — 17 issues)

Addressed all 17 violations from cubic-dev-ai first review:

### App.tsx
- **#1 (P1) Missing avv-component shape**: False positive — codebase fully migrated to avv-page shapes.
- **#2 (P2) Unbounded serverMessages**: Replaced array with `LatestMessage` (msg + monotonic seq counter).
- **#3 (P2) Non-reactive zoom**: Extracted `ZoomControls` component using tldraw `useValue` hook.

### RightPanel.tsx
- **#4 (P2) Stale hasStarted**: Removed restoration from persisted sessionId.
- **#5 (P1) Batched messages dropped**: Track `lastProcessedSeqRef` to ensure every message processed.
- **#11 (P1) XSS via allow-scripts**: Removed from option preview iframe (`sandbox=""`).

### TopBar.tsx
- **#15 (P3) Toast timer overlap**: `useRef` + `clearTimeout` before new timer.
- **#16 (P2) HTML false success**: `exportAsHtml` returns boolean; TopBar checks it.
- **#17 (P2) PNG false success**: `exportAsPng` returns `Promise<boolean>`; TopBar checks it.

### LeftSidebar.tsx
- **#10 (P2) In-place sort**: Changed to `[...page.sections].sort(...)`.

### export.ts
- **#12 (P2) Immediate blob URL revocation**: Added 1s delay via `setTimeout`.
- **#13 (P2) exportAsPng returns void**: Both export functions return boolean.

### parse-sections.ts
- **#9 (P2) No validation**: Added `isValidSection` type guard.

### session-persistence.ts
- **#14 (P2) No validation**: Runtime validation of session shape, chatHistory items, mode enum.

## Session 3: Review Fixes (second review — 2 issues)

### parse-sections.ts — Full PageSection field validation
- **Issue**: `isValidSection` only checked `id`, `name`, `status`, `order` but not `html`, `css`, `prompt`, `agentId`, `iteration`
- **Fix**: Split into `hasRequiredKeys()` + `normalizeSection()` with safe defaults for all fields.

### App.tsx + RightPanel.tsx — Queue-based message passing
- **Issue**: `latestMessage` state could drop messages if React batches state updates
- **Fix**: Replaced with ref-based queue + drain. Messages accumulate in `messageQueueRef`, `messageSeq` triggers renders, `drainMessages()` lets RightPanel process all queued messages atomically.

### PagePreview.tsx — CSP for iframe security
- **Improvement**: Added Content-Security-Policy meta tag restricting scripts to Tailwind CDN + inline only. `allow-same-origin` remains intentionally omitted.

## Session 4: Review Fixes (third review — 1 issue)

### App.tsx — Cap message queue size
- **Issue**: `messageQueueRef` grows unbounded when right panel is closed (not draining)
- **Fix**: Cap queue at `MAX_QUEUED_MESSAGES` (200). When exceeded, oldest messages are trimmed via `splice`. This prevents memory growth from sustained websocket traffic while retaining enough history for the chat panel to display when reopened.

### canvas.ts — Remove duplicate PageSection interface
- **Issue**: Two `PageSection` interfaces in `shared/types/canvas.ts` — second missing `prompt`, `agentId`, `iteration` fields
- **Fix**: Removed the duplicate incomplete definition; kept the full one (lines 4-14).

## Verification
- `pnpm build` — passes

## What's left to do
Nothing — all review violations addressed. Ready for re-review.
