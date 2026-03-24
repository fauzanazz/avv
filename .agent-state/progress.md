# FAU-65 Progress

## Status: Complete

## What was accomplished

All 19 features from the design document have been implemented:

### Layout V2
- Rewrote `App.tsx` with 3-panel Alexandria layout (TopBar + LeftSidebar + canvas + RightPanel)
- Created `TopBar` (h-14): AVV logo, connection status dot, export dropdown, panel toggle buttons
- Created `LeftSidebar` (w-60): layers tree showing page shapes with sections, status icons, retry on error
- Created `RightPanel` (w-80): AI chat with message types (user/agent/thinking/option/system), textarea, mode toggle, new project
- Dark canvas (stone-900) with dot grid background, tldraw `hideUi`, zoom controls overlay
- Both sidebars collapsible with toggle buttons appearing on canvas when collapsed

### Persistence
- `persistenceKey="avv-canvas"` on Tldraw for automatic canvas state persistence
- `session-persistence.ts` utility for localStorage save/load of chat history, mode, session ID
- RightPanel loads persisted session on mount, debounce-saves on change
- "New" button clears all localStorage (session + TLDRAW_ keys) and reloads

### Export
- `export.ts` utility using tldraw's `exportToBlob` API (adapted from design's `editor.toImage` which doesn't exist in tldraw v2.4.6)
- HTML download: standalone .html file with Tailwind CDN
- PNG download: 2x screenshot via `exportToBlob`
- Copy HTML: raw HTML to clipboard
- SVG for Figma: SVG to clipboard
- Toast notifications on all export actions

### Supporting changes
- Added `PageSection` type to `@avv/shared` canvas types
- Added `retry`, `chat` to `ClientMessage` and `agent:thinking`, `agent:option` to `ServerMessage`
- Created `AVVPageShapeUtil` with page-level shapes (title, status, sectionsJson)
- Added `parseSections` utility for parsing sections JSON
- Updated `index.html` with Google Fonts and Material Symbols
- Updated `app.css` with theme variables and material icon settings
- Deleted old components: PromptBar, StatusBar, LayersPanel, PropertiesPanel, ChatPanel
- Updated component barrel exports

## Decisions made
- **tldraw export API**: Design doc used `editor.toImage()` which doesn't exist in tldraw v2.4.6. Adapted to use `exportToBlob()` from the tldraw package instead.
- **Page shape types**: Design doc referenced `AVVPageShapeUtil`/`AVVPageProps`/`parseSections` that didn't exist. Created these as new shape types alongside existing `AVVComponentShapeUtil`.
- **Shared types**: Added `agent:thinking`, `agent:option` server messages and `retry`, `chat` client messages to support the new UI.
- **RightPanel typing**: Fixed `ChatEntry & { timestamp: Date }` intersection issue by using `Omit<ChatEntry, "timestamp"> & { timestamp: Date }`.

## What's left to do
Nothing — all features are implemented and passing type-check + build + smoke tests.

## Blockers
None.
