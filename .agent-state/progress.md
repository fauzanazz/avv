<<<<<<< HEAD
# FAU-35: Hono Backend with WebSocket and Session Management

## Status: Complete

## What was accomplished

All features from the design document are fully implemented and verified:

### Shared types (`@avv/shared`)
- `ApiResponse<T>` discriminated union (success/error)
- `GenerateRequest`, `Session` types
- `ServerMessage`, `ClientMessage` WebSocket message types
- `AVVComponent`, `ComponentStatus` canvas types

### API server (`@avv/api`)
- **Entry point** (`src/index.ts`): Hono app with CORS + logger middleware, Bun.serve with WebSocket upgrade at `/ws`
- **Health route** (`src/routes/health.ts`): `GET /api/health`
- **Session routes** (`src/routes/session.ts`): `GET /api/sessions`, `GET /api/sessions/:id`, `DELETE /api/sessions/:id`
- **Generate route** (`src/routes/generate.ts`): `POST /api/generate` with input validation
- **Session store** (`src/store/session-store.ts`): In-memory CRUD with sorted listing
- **Connection store** (`src/store/connection-store.ts`): Per-session WebSocket tracking with broadcast/send
- **WebSocket handler** (`src/ws.ts`): Client message routing (generate, iterate, cancel stubs)

## Verification
- `pnpm type-check` passes for both `@avv/shared` and `@avv/api`
- All REST endpoints tested manually and return expected responses
- Validation correctly rejects empty prompts and invalid modes
- 404 handling works for missing sessions

## What's left to do
- Nothing — all design doc requirements are implemented
- Agent orchestration, component iteration, auth, and persistence are explicitly out of scope

## Decisions made
- Validation uses `typeof body.prompt !== "string" || body.prompt.trim() === ""` for stricter empty-string checking (from code review feedback)
- `SessionStore.update` omits both `id` and `createdAt` from allowed updates (from code review feedback)
- WebSocket message handlers log but don't process — stubs for future orchestrator/iteration tickets
=======
# Progress — FAU-39 Revision

## Accomplished

All 7 review violations from cubic-dev-ai addressed:

1. **V1 (P1) — WS protocol**: Extracted `getDefaultWsUrl()` that selects `wss:` or `ws:` based on `window.location.protocol`.
2. **V2 (P1) — Reconnect-after-unmount**: Added `intentionalCloseRef` flag and `reconnectTimerRef` to guard reconnect in `onclose` and clear pending timers in cleanup.
3. **V3 (P2) — sessionId dependency churn**: Moved `sessionId` to a ref (`sessionIdRef`) so `connect` callback is stable and doesn't trigger effect re-runs when session starts.
4. **V4 (P1) — iframe allow-scripts**: Changed `sandbox="allow-scripts"` to `sandbox=""` to block script execution in preview iframes.
5. **V5 (P2) — PromptBar submit guard**: Added `!isConnected` check in `handleSubmit` alongside the existing disabled button.
6. **V6 (P1) — component:updated field mapping**: Properly destructure `x`, `y`, `width`, `height` from server updates and map them to tldraw shape fields (`x`, `y` at shape level; `w`, `h` in props).
7. **V7 (P1) — tsconfig composite**: Added `composite: true` to shared tsconfig. Changed web build from `tsc -b` to `tsc --noEmit` since Vite handles compilation (avoids composite/noEmit conflict).

## What's Left

Nothing — all violations addressed. Type-check and build both pass.

## Decisions

- **Web build script**: Changed from `tsc -b && vite build` to `tsc --noEmit && vite build`. `tsc -b` requires `composite: true` which is incompatible with `tsc --noEmit` for type-checking. Since Vite handles TS compilation, `tsc --noEmit` is the correct pre-build check.
- **Design doc updated**: Updated the design doc's default WS URL to reflect the protocol-aware helper.
>>>>>>> 55e7f37 (fix: address all 7 review violations from cubic-dev-ai [FAU-39])
