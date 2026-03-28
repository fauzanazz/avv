# R2 Storage Migration — Design Document

**Date:** 2026-03-28
**Spec:** `.planning/spec-r2-migration.md`
**Goal:** Make AVV's API server stateless by replacing local filesystem project storage with Cloudflare R2.

---

## Architecture

### Before (local filesystem)

```
Agent SDK → writes to ~/avv-projects/{id}/ (permanent)
                ↓
         readFileSync() everywhere
                ↓
    ├── sandbox sync
    ├── preview static fallback
    ├── GitHub push
    └── conversation restore
```

### After (R2 + ephemeral local)

```
Agent SDK → writes to /tmp/avv/{id}/ (ephemeral)
                ↓
         FileStorage.put() on each write
                ↓
    R2 bucket: {conversationId}/{relativePath}
                ↓
    ├── sandbox sync (from R2 on restore)
    ├── preview static fallback (from R2)
    ├── GitHub push (from R2)
    └── conversation restore (from R2 → sandbox)
```

---

## Storage Provider Abstraction

```
packages/api/src/storage/
├── types.ts       # FileStorage interface
├── r2.ts          # R2Storage — Bun.S3 client for production
├── local.ts       # LocalStorage — wraps current fs behavior for dev
└── index.ts       # Exports active provider based on NODE_ENV
```

### Interface

```typescript
export interface FileStorage {
  put(conversationId: string, relativePath: string, content: string | Uint8Array): Promise<void>;
  get(conversationId: string, relativePath: string): Promise<string | null>;
  getBuffer(conversationId: string, relativePath: string): Promise<Uint8Array | null>;
  list(conversationId: string): Promise<string[]>;
  delete(conversationId: string, relativePath?: string): Promise<void>;
  exists(conversationId: string, relativePath: string): Promise<boolean>;
}
```

### R2Storage

- Uses `Bun.S3Client` (native, zero deps)
- R2 key format: `{conversationId}/{relativePath}` (e.g., `abc123/src/App.tsx`)
- Env vars: `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`
- `delete(cid)` without path deletes all files for a conversation (prefix delete)
- `list(cid)` returns relative paths for the conversation

### LocalStorage

- Wraps current filesystem behavior (`~/avv-projects/{id}/`)
- Used when `NODE_ENV !== 'production'`
- Implements same interface using `fs/promises`
- No behavioral change from current codebase in dev mode

### Provider Selection

```typescript
// storage/index.ts
export const storage: FileStorage =
  process.env.NODE_ENV === "production"
    ? new R2Storage()
    : new LocalStorage();
```

---

## File Changes

### 1. `scaffolder.ts`

**Current:** Copies template to `~/avv-projects/{id}/`, runs `pnpm install`.

**After:**
- In production: copies template to `/tmp/avv/{id}/`, runs install, then uploads all files to R2 via `storage.put()`
- In dev: unchanged behavior via `LocalStorage`
- New helper: `getOrCreateProjectDir(cid)` — in prod, downloads from R2 to `/tmp/avv/{id}/` if files exist; in dev, returns `~/avv-projects/{id}/`
- New helper: `cleanupTempDir(cid)` — removes `/tmp/avv/{id}/` after agent completes (prod only)
- New helper: `uploadProjectToStorage(cid, projectDir)` — uploads all non-node_modules files to storage

### 2. `preview-store.ts`

**Current:** Tracks absolute paths (`/Users/x/avv-projects/abc/src/App.tsx`).

**After:**
- Tracks relative paths (`src/App.tsx`)
- Removes `getProjectDir()` (no longer meaningful with R2)
- Add `relativePath(projectDir, absolutePath)` helper for converting during writes

### 3. `ws.ts`

**Current:** `readFileSync` on Write/Edit complete, `scanProjectChanges` after Bash.

**After:**
- On Write/Edit complete: read content from disk (still in /tmp during agent run), upload to R2 via `storage.put()`, broadcast `file:changed` with relative path
- On Bash complete: scan temp dir, upload changed files to R2
- `restoreFileState()`: read file list from `preview-store`, get content from `storage.get()`, send to client
- After agent completes: call `cleanupTempDir(cid)`

### 4. `sandbox-manager.ts`

**Current:** `syncFileToSandbox` reads local file → uploads to sandbox.

**After:**
- Add `syncFileToSandboxFromContent(cid, relativePath, content)` — takes content directly instead of reading from disk
- On restore: iterate `storage.list(cid)` → `storage.getBuffer()` → `sandbox.uploadContent()`
- Remove dependency on local disk for restore path

### 5. `index.ts`

**Current:** Static fallback serves files from local disk.

**After:**
- Static fallback calls `storage.get(conversationId, filePath)` → serve response
- No local disk reads

### 6. `dev-server.ts`

**Current:** Always available.

**After:**
- Gate `startDevServer()` behind `process.env.NODE_ENV !== 'production'`
- In production, if called, returns early with a warning log
- No other changes needed

---

## Data Flow: Detailed Scenarios

### Scenario 1: New project generation (production)

```
1. User approves prompt
2. scaffoldProject(cid)
   → mkdir /tmp/avv/{cid}/
   → cp template → /tmp/avv/{cid}/
   → pnpm install
   → uploadProjectToStorage(cid, /tmp/avv/{cid}/)  [template files to R2]
3. createSandboxSession(cid)
   → upload template to sandbox (from /tmp/)
4. runAgent({ cwd: /tmp/avv/{cid}/ })
   → Agent Write/Edit → file on disk
   → ws.ts onMessage → readFileSync → storage.put() + syncToSandbox + broadcast
   → Agent Bash → scanProjectChanges → storage.put() for new files
5. Agent completes
   → cleanupTempDir(cid) [delete /tmp/avv/{cid}/]
```

### Scenario 2: Iterative edit (production)

```
1. User sends "make hero darker"
2. getOrCreateProjectDir(cid)
   → mkdir /tmp/avv/{cid}/
   → storage.list(cid) → download all files from R2 → /tmp/avv/{cid}/
   → pnpm install
3. runAgent({ cwd: /tmp/avv/{cid}/ })
   → Agent edits files
   → upload changes to R2
4. Agent completes → cleanupTempDir(cid)
```

### Scenario 3: Conversation restore (production)

```
1. User loads conversation
2. restoreFileState(ws, cid)
   → previewStore.getTrackedFiles(cid) → ["src/App.tsx", "src/components/Hero.tsx", ...]
   → for each: storage.get(cid, path) → broadcast file:changed
   → buildFileTree() → broadcast file:tree
3. Restore preview
   → createSandboxSession(cid)
   → storage.list(cid) → storage.getBuffer() → sandbox.uploadContent() for each
   → broadcast preview:ready
```

---

## Env Configuration

```env
# .env.production
NODE_ENV=production
R2_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=<key>
R2_SECRET_ACCESS_KEY=<secret>
R2_BUCKET=avv-projects
```

```env
# .env.development (or unset)
NODE_ENV=development
# No R2 vars needed — LocalStorage uses ~/avv-projects/
```

---

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| R2 latency on iterative edits (download project on each edit) | Template is small (~10 files). Parallel downloads. Could add caching later if needed. |
| Temp dir cleanup fails (disk fills) | Add cleanup on server startup (wipe `/tmp/avv/`). Temp dirs are small (no node_modules in R2). |
| Bun.S3 API changes | Pin Bun version. S3 API is stable. |
| Large projects exceed R2 limits | R2 has no per-object size limit. Bucket-level quotas are generous (10GB free tier). |
