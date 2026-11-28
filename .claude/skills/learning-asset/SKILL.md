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
- `plugins/` — features (`readPoint`, `marks`, `search`, `tableOfContents`, `sourceReveal`), each a `LearningAssetPlugin`
  (`plugins/types.ts`) listed in `plugins/index.ts`.
- `../marks/`, `../readPoint/` — shared with the PDF view (mark storage and UI, read point
  precedence and saving); keep them renderer-agnostic. `useReadPointPlacement` publishes the
  current precedence to `app.readPointSource` and `useMarks` the set slots to `app.markSlots`
  (both cleared on unmount) for the header's `QuickSettings`, so a change never needs a
  separate dispatch to show there.

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
- Read point and mark commands are typed `ReadingCommand`s: send with
  `dispatch(runReadingCommand(command))`, handle with `useReadingCommand`
  (`src/commands/readingCommands.ts`). Both views handle the same ones. A command is a Redux request
  with a `seq`, so it reaches a handler after the next render, and never one that mounts later.

## Positions and scrolling

- `ReadingPosition { split: seq, block }` — `block` indexes the Lexical root's top-level children.
  `NO_READ_POINT` means none (`isNoReadPoint`).
- Always scroll with `navigate(seq, land)`: it pre-scrolls to the split's estimated offset, mounts
  it, waits a painted frame, then calls `land(root, scrollElement)`. Use `landOnBlock`. The last request
  wins. Past the header's fixed zone a block lands flush with the top and the header is hidden
  (`hideHeadroom`); measure "the top" with `viewportTop`, never a fixed header height.
- While a jump (including the read point restore on open) lands, the mount window is locked onto its
  split and neighbours, so the viewport observer can't move it until the jump has landed.
- A fast scroll or a long scrollbar drag doesn't mount the splits it flies past: the mount window
  follows `primarySeq` only while reading, and otherwise waits for the scroll to settle. So a split
  can mount after scrolling stops, and `primarySeq`'s content root may briefly not exist.
- Measure "on scroll" through `onViewportChange(listener)`, never a raw scroll listener, as
  `readPoint` and `tableOfContents` do. It fires once a frame, and also when the top split mounts
  after a fast scroll settles.
- **Resuming a review.** `initialViewPosition` (a `ViewPosition`: top block plus `scrollTop`'s
  offset past it) opens there instead of the read point. `onLeave` reports where the reader was on
  unmount (`null` if they never scrolled). Scrolling is only measured while `onLeave` is set, so
  pass it only for the study session's asset under review. Every open of that asset (Return, the
  sidebar, back) uses both through `useReviewResume`; the read point does the same for its
  precedence (`resumeSource`/`onLeave` on `useReadPointPlacement`).
- `getContentRoot(seq)` is `undefined` for unmounted splits — handle it; don't query the DOM.
- **Anchors.** For "here" actions use `anchors.resolveVisibleAnchor()`. For the block at the viewport
  top use `anchors.topVisibleBlock()`, as the read point does. `anchors.topVisible()` adds the scroll
  offset past it, at the cost of another layout read, for the remembered view position.
- Land with `scrollGeometry.ts`'s `contentTopOf`/`jumpTo`, which hide the header past its fixed
  zone like every other landing.
- Per-split ref callbacks must be stable: use `useKeyedRefCallbacks`.

## Opening at a spot

A navigation that opens an asset at one place, not to read it (a global search result, the Origin
panel's "Derived from" link), passes `spotNavigationState()` (`src/types/elements/`) as router
state. Outside its review the read point then opens at `lookup` precedence
(`useOpeningReadPointSource`), so only a manual set moves it. `revealHighlightOf` asks the view to
scroll to the highlight that element was made from: `sourceReveal` looks it up with
`find_learning_asset_highlight`, the PDF view's `PdfSourceReveal` from its loaded highlights, and an
extract with `RevealHighlightPlugin`.

The read point's gutter marker shows how far through it is in its tooltip, as marks do, from
`useMarksContext().progressOf`.

## Testing

Tests mirror the source under `src/__test__/features/ElementViewer/LearningAssetView/`. Fake roots
as `div`s with stubbed `getBoundingClientRect`, and fake the core contexts as in
`SplitSlot.test.tsx`. jsdom has no layout, so check scrolling changes in `npm run tauri dev`.
