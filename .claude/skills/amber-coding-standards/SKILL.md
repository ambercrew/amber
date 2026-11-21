---
name: amber-coding-standards
description: >
    Amber's coding standards and the maintainer's preferences for writing frontend (React,
    TypeScript) and backend (Rust) code. Use this skill whenever writing, refactoring or reviewing
    code in this repository, and especially when (1) about to keep state outside a component, store
    or service (module-level `let`, singletons, `static` with interior mutability), (2) about to add
    a React context or provider, (3) about to add an npm or Cargo dependency, (4) about to write a
    custom component, hook or utility that a library might already provide, or (5) writing or
    changing one of Amber's skills in `.claude/skills/`.
---

# Amber coding standards

These apply on top of CLAUDE.md. When a rule here conflicts with what nearby code does, follow
the rule, since old code that breaks it isn't a pattern to copy.

## No global mutable state

Don't keep mutable state at module level: no module-level `let`, no mutable singleton objects, no
Rust `static` holding a `Mutex`/`RwLock`/`Cell`. It outlives components and tests, leaks between
test cases and can't be reset or injected.

Put state where its lifetime belongs instead:

| State                               | Where it goes                                                    |
| ----------------------------------- | ---------------------------------------------------------------- |
| One component's                     | `useState` / `useRef`                                            |
| Shared across features or pages     | A Redux slice in `src/stores/`                                   |
| A view's subtree (rarely; see next) | A context owned by that view's provider                          |
| Backend, per request                | A scoped service resolved from the `Injector`                    |
| Backend, app-lifetime               | A singleton registered in `create_injector.rs`, or Tauri `State` |

Immutable module values are fine: `const` objects and lookup tables, and Rust `const`s or
`LazyLock<Regex>` for compiled patterns. So is a cache of a pure function's results keyed by its
input (`renderEquation`'s cache, a `WeakMap` keyed by the object it describes), since it never
changes what the code does.

A request to whatever is mounted is a Redux action. When only mounted handlers care, they listen
for it with `addListener` (the store's listener middleware) in an effect, as `useReadingCommand`
and `useFocusRequested` do; never store such an event as state with a `seq`. A request that must
wait for its target to mount goes in a slice until it's taken (`pendingFocus`,
`pendingTreeReveal`). Fetched data shared across mounts goes in a slice (`imageOcclusion`). An id
that only has to be unique is `crypto.randomUUID()` or `nanoid()`, never a module counter.

Live objects that can't go in Redux (DOM `Range`s, say) belong to the view that owns them: create
the instance in its `useState` and share it through a narrow context, as `ElementViewer` does with
`SearchHighlightRegistry`. State one mount owns, like a portal key per DOM node, lives in its
effect.

The only module singletons are in `src/managers/`: adapters over one process-wide resource whose
callbacks are functions (the window's close request, Android's back button, the keyboard layout)
or must be awaited (`syncEventManager`, which a sync waits on). Each is a class, so tests can make
their own, with one `default…` instance.

## Prefer fewer React contexts

Reach for a context last. In order of preference:

1. **Props.** Passing a value down two or three levels is fine.
2. **A hook** that reads Redux (`useAppSelector`) or wraps the logic, called where it's needed.
3. **Redux** for anything app-wide or read by unrelated features. Never add a top-level provider
   for global state.
4. **A context** only for a view whose subtree shares live, view-scoped state or imperative handles
   that would otherwise be threaded through many layers, as `ReaderCoreProvider` and
   `PdfCoreProvider` do. Extend the view's existing context, or its plugin's, before adding another.

When a context is justified, keep it narrow: one concern, a stable value, and a `use<Name>()` hook
that throws outside its provider. Split it if parts change at very different rates.

## Prefer built-in solutions; ask before adding your own

Before writing something yourself, check, in this order:

1. **The project.** Existing hooks (`src/hooks/`: `useApi`, `useTauriEvent`, `useFocusedRow`,
   `useVirtualListScroll`…), components (`src/components/`), utils, `paths.ts` and the command
   registry.
2. **Mantine.** `@mantine/core` components and style props, and `@mantine/hooks` (`useDisclosure`,
   `useDebouncedValue`, `useDebouncedCallback`, `useLocalStorage`, `useElementSize`,
   `useClickOutside`, `useHotkeys`…). Use the Mantine MCP tools (`search_docs`, `get_item_doc`) to
   confirm what exists in Mantine 9.
3. **Libraries already installed**, such as Lexical's `@lexical/utils`, dayjs, Redux Toolkit
   (`createSlice`, `createSelector`, `createAsyncThunk`), `@tanstack/react-virtual`, and on the
   backend `sqlx`, `tokio` and `serde`.
4. **The platform.** Web APIs (`Intl`, `structuredClone`, `AbortController`, `ResizeObserver`), the
   Rust std, and Tauri's plugins.

If none of these covers it, **stop and ask the user** before adding a dependency (npm or Cargo)
or writing a substantial custom implementation (a new component that resembles a Mantine one, a
hand-rolled hook, a parser, a state manager). Say what you looked for, what's missing, and the
options (a library, with its size and how well maintained it is, or custom code). Small glue code
that composes built-ins doesn't need asking.

## React specifics

- The React Compiler is on (`vite.config.ts`), so new code doesn't need `useMemo`, `useCallback` or
  `memo` for performance. Components using `useVirtualizer` need `"use no memo"`.
- Derive values during render instead of syncing them with `useEffect` + `useState`.
- Subscribe to Tauri events with `useTauriEvent`, not a hand-written `listen` effect.

## Frontend file layout

Put a new file where its kind goes, never loose in a feature's root:

| File                                   | Where it goes                                                    |
| -------------------------------------- | ---------------------------------------------------------------- |
| A feature's components                 | `src/features/<Feature>/components/`                             |
| A feature's hooks / plain logic        | `src/features/<Feature>/hooks/` / `utils/`                       |
| A view with its own parts              | its own folder in the feature (`LearningAssetView/`, `PdfView/`) |
| A shared component                     | `src/components/<Name>/<Name>.tsx`, with its own hooks beside it |
| A Redux slice                          | `src/stores/<slice>/<slice>Actions/Reducer/Selectors.ts`         |
| An API wrapper / its DTOs / its events | `src/api/<module>/api/` / `dto/` / `events/`                     |
| A test                                 | `src/__test__/` at the source's path, `<file>.test.ts(x)`        |

A test file may split one component's tests by scenario (`ElementTreeCreate.test.tsx` beside
`ElementTree.test.tsx`), but it stays in that component's folder.

## Backend file layout

Each module in `src-tauri/src/<module>/` follows the onion layers in CLAUDE.md:

| File                                 | Where it goes                                                     |
| ------------------------------------ | ----------------------------------------------------------------- |
| Tauri commands                       | `<module>_api.rs`, named after the module, or `api/` when several |
| DTOs / events                        | `dto/` (or `dto.rs` while small) / `events/<name>_event.rs`       |
| Pure data                            | `entities/`, `value_objects/`                                     |
| Service traits / implementations     | `services/` / `services/implementations/`                         |
| Repository traits / SQLite impls     | `repositories/` / `infrastructure/repositories/sqlite/`           |
| Client traits / HTTP implementations | `clients/` / `infrastructure/clients/`                            |
| Background tasks                     | `background.rs`                                                   |
| Pure helpers                         | `utils/`                                                          |

App-lifetime backend state goes in Tauri `State` (`.manage` in `lib.rs`, as `AssetReadPermits`
does) or an injector singleton, never a `static` with interior mutability; a `LazyLock<Regex>` or
other immutable table is fine.

## Rust specifics

- `mod.rs` holds module declarations and re-exports only; code goes in a named file beside it. Don't
  name that file after its module (`foo/foo.rs`), which clippy flags as `module_inception`.

## Project rules to check

CLAUDE.md explains each of these; they're listed here so a review catches them.

- **UI:** Mantine components and style props, Phosphor icons, no `.module.css` for what Mantine's
  props cover, and `AppTooltip` instead of Mantine's `Tooltip`.
- **Shortcuts:** every shortcut string is in `src/config/shortcuts.ts`, and every displayed one goes
  through `useShortcutDisplay()` (or `AppTooltip`'s `shortcut`, `useCommandShortcut`), never
  `formatShortcut`.
- **Routing:** navigate with `paths.ts` builders (`paths.root()`, not `"/"`) and read params with
  `useElementParams()`, never `useParams()`.
- **API calls:** through the wrappers in `src/api/`, one `callApi` per action, with its error shown
  next to the action. Bulk commands take element ids, never a filter.
- **Backend:** ids written as `id().hyphenated()`, commands as thin handlers resolving services from
  the `Injector`, and events in a module's `events/` directory on both sides.
- **Comments:** one or two lines, keeping the reason. A lint directive below them and a diagram (like a
  test tree) don't count; anything longer belongs in a skill or CLAUDE.md.
- **Tests:** in `src/__test__/` (TypeScript) or an inline `mod tests` (Rust), named
  `"Should … when …"` / `method_scenario_expected_result`, with `// Arrange`, `// Act` and
  `// Assert` sections (`// Arrange & Act` when rendering is the act).

## Writing skills

Use `skill-creator` for how to write a skill; for Amber's own:

- They're real directories in `.claude/skills/`, never in `.agents/skills/` or `skills-lock.json`.
  Add a third-party skill with `npx skills add <owner/repo> -s <skill>`, then
  `npx skills experimental_install -a claude-code`, as `add -y` copies it into `.claude/skills/`
  instead of linking it.
- Write the rules the code doesn't make obvious, with their reasons, and name files and symbols
  exactly in backticks so they can be searched for. Check every name still exists when changing a
  skill, and update a skill in the same change as the code it describes.
- List a new skill in CLAUDE.md's Skills section, and cut the CLAUDE.md section it covers down to a
  summary plus "Load the `<name>` skill before changing it".

## Checklist before finishing

- [ ] No new module-level `let`, mutable singleton or mutable `static`.
- [ ] No new context where props, a hook or Redux would do.
- [ ] No new dependency or custom replacement for a built-in without the user's go-ahead.
- [ ] The project rules above hold for the changed code.
- [ ] Frontend: `npm run lint`, `npm run build` (the TypeScript check) and the relevant `npm run test` tests
      pass.
- [ ] Backend: `cargo clippy --all-targets --features wry` is clean and
      `cargo test --workspace --features wry` passes.
