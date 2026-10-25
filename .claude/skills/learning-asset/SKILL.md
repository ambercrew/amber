---
name: learning-asset
description: >
    How Amber's text learning asset view works and how to extend it. Use when adding a feature to
    the learning asset reader, changing how splits mount, measure or scroll, touching its read point,
    marks or find-in-page, or working with `LearningAssetView`, `useReaderCore`, `navigate`,
    `LearningAssetPlugin`, `SplitSlot` or `ReadingPosition`. Not for the PDF view (`PdfView/`).
---

# Learning asset view

`src/features/ElementViewer/LearningAssetView/` renders a learning asset's **splits** (one Lexical
document each) as a virtualized stack: live editors near the viewport, placeholders elsewhere.

- `core/` — `ReaderCoreProvider` owns mounting, heights, content roots, navigation and reading
  anchors; plugins read it via `useReaderCore()`.
- `plugins/` — features (`readPoint`, `marks`, `search`, `tableOfContents`), each a `LearningAssetPlugin`
  (`plugins/types.ts`) listed in `plugins/index.ts`.
- `../marks/`, `../readPoint/` — shared with the PDF view (mark storage and UI, read point
  precedence and saving); keep them renderer-agnostic.

## Adding a feature

Add `plugins/<name>/` and list it in `learningAssetPlugins`, using only the parts you need:
`Provider` (view-wide hooks + its own context), `SplitPlugin` (Lexical plugin in each mounted
split; seq from `useSplit()`), `ContextMenuItems` (a menu section; the host adds dividers and
`contextMenuOrder` sets its place), `Overlay`.

- Never add feature props to `LearningAssetView`, `SplitSlot` or `ElementEditor`. If the core lacks
  something, add a general capability to `ReaderCore`.
- List order is nesting order: a plugin may only read contexts of plugins before it (`marks`
  follows `readPoint` because it draws the read point).
- A `SplitPlugin` exists only while its split is mounted; whole-asset logic belongs in the
  `Provider`, using `splits` metadata and `getHeight`.
- React to editor events with a Lexical command listener in a `SplitPlugin` (e.g.
  `HIGHLIGHT_CREATED_COMMAND` in `readPoint/ExtractReadPointPlugin`), not a core event bus.
- Read point and mark commands are typed `ReadingCommand`s: send with `runReadingCommand`, handle
  with `useReadingCommand` (`src/commands/readingCommands.ts`). Both views handle the same ones.

## Positions and scrolling

- `ReadingPosition { split: seq, block }` — `block` indexes the Lexical root's top-level children.
  `NO_READ_POINT` means none (`isNoReadPoint`).
- Always scroll with `navigate(seq, land)`: it pre-scrolls to the split's estimated offset, mounts
  it, waits a painted frame, then calls `land(root, scrollElement)`. Use `landOnBlock`. The last request
  wins. Past the header's fixed zone a block lands flush with the top and the header is hidden
  (`hideHeadroom`); measure "the top" with `viewportTop`, never a fixed header height.
- While a jump (including the read point restore on open) lands, only its split is mounted; its
  neighbours mount once it has landed, so a neighbour's content root may not exist yet right after.
- `getContentRoot(seq)` is `undefined` for unmounted splits — handle it; don't query the DOM.
- For "here" actions use `anchors.resolveVisibleAnchor()`.
- Per-split ref callbacks must be stable: use `useKeyedRefCallbacks`.

## Testing

Tests mirror the source under `src/__test__/features/ElementViewer/LearningAssetView/`. Fake roots
as `div`s with stubbed `getBoundingClientRect`, and fake the core contexts as in
`SplitSlot.test.tsx`. jsdom has no layout, so check scrolling changes in `npm run tauri dev`.

Keep this skill and CLAUDE.md's "Learning Asset View" section current.
