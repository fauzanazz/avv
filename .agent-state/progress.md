# FAU-45: Refactor to Page/Section Data Model — Progress

## Status: Complete

## What was accomplished

All 18 features from the design document have been implemented and verified:

### Shared types (`packages/shared/src/types/`)
- `canvas.ts`: New `AVVPage`, `PageSection`, `ComponentStatus` types. Deprecated `AVVComponent` kept for reference.
- `ws.ts`: New message types — `page:created`, `page:status`, `section:updated`, `section:status`. Updated `iterate` client message with `pageId`/`sectionId`.
- `agent.ts`: `SectionPlan` and `DesignPlan` with `sections[]` instead of `components[]`. No x/y/width/height.

### New avv-page shape (`packages/web/src/canvas/shapes/avv-page/`)
- `avv-page-types.ts`: Shape type, props with `sectionsJson` serialization, parse/serialize helpers.
- `AVVPageShapeUtil.tsx`: ShapeUtil with stitched HTML rendering, status bar, resize support.
- `PagePreview.tsx`: Single iframe rendering all sections together with Tailwind CDN.
- `PageStatusBar.tsx`: Title bar with section progress indicator.
- `index.ts`: Barrel exports.

### Updated barrel exports
- `shapes/index.ts` and `shapes.ts` export only avv-page, no avv-component references.

### Deleted old shape
- `packages/web/src/canvas/shapes/avv-component/` directory fully removed.

### Canvas sync (`packages/web/src/hooks/useCanvasSync.ts`)
- Handles `page:created`, `section:updated`, `section:status`, `page:status`.
- Maps server page IDs to tldraw shape IDs.
- Derives page status from section statuses.

### Orchestrator (`packages/api/src/agents/orchestrator.ts`)
- Creates 1 page with pending sections (not N separate components).
- Broadcasts `page:created` once, then `section:status`/`section:updated` per builder.
- Plan prompt uses sections with `order` field, no canvas coordinates.

### Orchestrator prompt (`packages/api/prompts/orchestrator.md`)
- Sections rendered vertically in document flow, CSS handles layout.
- No x/y/width/height references.

### Iterator (`packages/api/src/agents/iterator.ts`)
- Takes `pageId`, `sectionId`, `sectionName` for section-level iteration.
- Broadcasts `section:updated` on completion.

### Layers panel (`packages/web/src/components/LayersPanel.tsx`)
- Hierarchical tree: Page > Section 1, Section 2, ...
- Click to select page or individual section.
- Status indicators per section.

### Context menu, Properties panel, Image patching
- All updated to work with page/section model.

### App.tsx
- Uses `AVVPageShapeUtil`, no old component references.

## Verification
- `pnpm type-check`: All 3 packages pass (shared, web, api)
- `bun test`: All 37 tests pass across 5 test files
- No remaining references to `avv-component` in source code (only in old design docs)

## What's left to do
Nothing — all requirements from the design document are implemented.

## Decisions made
- The deprecated `AVVComponent` interface is kept in `canvas.ts` as specified in the design doc.
- Old design docs in `docs/designs/` still reference `avv-component` — this is expected since they document the V1 architecture.
