# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Amber is a Tauri 2 desktop app (React 19 frontend, Rust backend) for incremental learning.

## UI Guidelines

- Use **Mantine** (`@mantine/core`, `@mantine/hooks`) components for all UI. Prefer built-in Mantine components over building custom ones.
- Use **`@phosphor-icons/react`** for icons.
- Use **`AppTooltip`** (`src/components/AppTooltip/AppTooltip.tsx`) instead of Mantine's `Tooltip` — it takes the same props and accepts a `shortcut` prop (raw `useHotkeys` notation, e.g. `"mod+K"`). Never hand-append a shortcut to a tooltip label. Pass `touch` to also open on tap, but only on targets whose meaning is otherwise unreachable on touch (info icons, study session buttons) — not on action buttons whose label is already visible.
- **Never display a keyboard shortcut on touch input** — there's no keyboard to press it with. Every shortcut shown in the UI must be rendered through `useShortcutDisplay()` (`src/commands/useShortcutDisplay.ts`), which formats it and yields `undefined` on a coarse pointer; `AppTooltip`'s `shortcut` prop and `useCommandShortcut(id)` already go through it. Never call `formatShortcut` directly from a component.
- Avoid custom CSS. Use Mantine's built-in style props (`p`, `px`, `h`, `w`, `gap`, `justify`, `align`) and inline `style` objects only when Mantine props are insufficient. Do not create `.module.css` files for layout or cosmetic concerns that Mantine already covers.

## Commands

```bash
# Development
npm run tauri dev        # Start full Tauri dev environment
npm run dev               # Vite dev server only (no Tauri shell)

# Build
npm run tauri build       # Production build
npm run build             # TypeScript check + Vite build only
npm run android:dev       # Tauri Android dev build
npm run android:build     # Tauri Android production build

# Linting & Formatting
npm run lint               # ESLint
npm run format             # Prettier

# Testing
npm run test               # Vitest unit tests
npm run uitest              # Vitest with the interactive UI
npm run coverage            # Coverage report
```

### Rust backend

```bash
cd src-tauri
cargo build --features wry
cargo test --workspace --features wry
cargo clippy --all-targets --features wry
```

`Cargo.toml` has **no default runtime feature** — each platform's `tauri.<platform>.conf.json` opts into its own runtime (**CEF on Linux, WRY elsewhere**). Bare `cargo build`/`test`/`clippy` therefore fails to compile (`tauri::Wry` not found); always pass `--features wry` for local dev/CI regardless of host OS. Never add a `default` feature — it would silently combine with a platform's own choice.

`[patch.crates-io]` redirects `tauri`/`tauri-plugin-*`/`tauri-runtime-wry` to a `feat/cef` fork (adds CEF support upstream lacks). Behavior may diverge from published Tauri — keep this in mind when a bug looks upstream.

## Backend Architecture (`src-tauri/src/`)

The backend follows **onion architecture** (Clean Architecture) with custom dependency injection.

### Layers (inner → outer)

| Layer          | Directory                                                                 | Role                                                                    |
| -------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Domain         | `entities/`, `value_objects/`                                             | Pure data models, no I/O                                                |
| Application    | `services/`                                                               | Reusable business logic; keeps presentation handlers thin               |
| Presentation   | `<module>_api.rs` (or an `api/` subdir for larger modules like `backend`) | Tauri command handlers; resolves dependencies and delegates to services |
| Infrastructure | `repositories/infrastructure/`, `infrastructure/`                         | SQLite, HTTP clients                                                    |

### Dependency Injection

A custom `injector` crate (with derive macros in `injector_derive`) wires everything together. Services are registered in `common/utils/create_injector.rs`. Every Tauri command handler follows this pattern:

```rust
#[tauri::command]
async fn some_command(injector: State<'_, Arc<Injector>>, ...) -> Result<Dto, ApiError> {
    let scope = injector.start_scope();
    let service = scope.resolve::<dyn SomeService>();
    let result = service.do_work(...).await?;
    scope.save_changes().await?;  // Unit of Work — commits DB transaction
    Ok(result)
}
```

### Bulk Operations

Bulk-operation commands (e.g. `src/features/ElementsBrowser`'s results action bar — reschedule, tags, set source, delete) always take an explicit list of element ids, never the search/filter query that produced them. The frontend resolves the query to `ElementId`s before calling; the backend has no knowledge of `ElementFilter`/search state.

### Event Manager (`common/event_manager.rs`)

The `EventManager` trait (impl: `TauriEventManager`, `common/services/implementations/tauri_event_manager.rs`) lets services queue frontend-bound events during a request scope instead of emitting immediately — `event_manager.push(name, body)` (e.g. `ELEMENT_CREATED_EVENT` in `default_element_creation_service.rs`), with identical `AppEvent`s deduplicated. Events are only flushed (via `emit_all()` → `AppHandle::emit`) from inside `SqliteTransactionManager::save_changes`, right after the DB transaction commits. This ties emission to the Unit-of-Work commit, so the frontend never sees an event for a change that didn't actually persist.

### Domain Modules

- **elements** — Core content tree: `Folder`, `LearningAsset`, `Extract`, `Card` (see Element Duplication below)
- **study** — FSRS spaced-repetition scheduling (study profiles, card grading) and the global review-priority queue (`MetaRepository`'s priority-ordering methods)
- **bibliographical_sources** — Registry of original works (book, article, video, etc.) that elements are imported from; one `BibliographicalSource` is shared by every element derived from it (`Meta::bibliographical_source_id`). The UI pairs it with the per-element `derived_from` lineage under the umbrella term **origin**
- **import** — PDF/HTML/URL content import pipeline (extraction, conversion to elements)
- **backend** — Remote auth (sign-up, sign-in, etc.)
- **secrets** — `SecretsRepository` trait for reading/writing OS-level secrets; keyring implementation lives in `infrastructure/repositories/keyring/`
- **settings** — User preferences
- **local_configurations** — Per-machine config not synced to the cloud (e.g. database location)
- **sync** — Cloud sync via protobuf messages (see Sync below)
- **backup** — Background auto-backup service
- **app_info** — Small app-level queries (e.g. store-build detection)
- **database** — SQLite connection management

### Sync

The `SyncEngine` (`sync/engine.rs`, impl: `sync/implementations/default_sync_engine.rs`) pushes pending local changes then pulls/applies remote ones, behind the single `sync` command (`sync/sync_api.rs`). The unit of sync is a **cell** (one column value in one row) — `CellChange { tbl, row_id, col, value, hlc, device_id }`, a `prost_build` protobuf message. SQLite triggers auto-stage local changes into `sync_cells`; conflicts resolve last-writer-wins via **Hybrid Logical Clocks** (`sync/hlc/`). A `SyncLock` serializes overlapping cycles so pull/push stays causal across devices. On the frontend, `src/stores/sync/syncActions.ts` dispatches the sync thunk and reports success/failure via a Mantine notification (see error-handling rule below).

**BLOB primary keys are incompatible with sync** — a synced table's primary key is serialized as JSON text for the cell's `row_id`, so BLOB-affinity PKs are rejected at registration (`SyncError::InvalidPrimaryKey`, `sync/implementations/sqlite_sync_store/column_info.rs`). Keep synced PKs TEXT-affinity (e.g. hyphenated UUID strings).

### Naming Conventions

- DTOs: `*RequestDto`, `*ResponseDto` (used at the API boundary)
- Entities: plain struct names
- Repository traits live in `repositories/`, implementations in `repositories/infrastructure/sqlite/`
- Error types use `thiserror`; all commands return `Result<T, ApiError>`
- IDs must be written to repositories as **hyphenated** UUID strings (`id().hyphenated()`), never `.to_string()`/`.simple()` — this also keeps them TEXT-affinity so they stay eligible as sync primary keys (see BLOB note under Sync above).

### Events

Backend → frontend event names and payloads live under a module's `events/` directory (e.g. `elements/events/element_created_event.rs`), never in `dto/` or inlined in a service — one file per event, holding both the name constant and its payload struct (e.g. `ELEMENT_CREATED_EVENT` + `ElementCreatedEventDto`). The frontend mirrors this at `src/api/<module>/events/<eventName>.ts` (e.g. `CONVERT_MARKDOWN_TO_LEXICAL_EVENT` + `ConvertMarkdownToLexicalEventDto` in `src/api/common/events/convertMarkdownToLexicalEvent.ts`), in whichever `api/` module matches the Rust event's module. Keep the event name string identical on both sides by hand — there's no compile-time link across the language boundary.

### Element Duplication

Elements (`Folder`, `LearningAsset`, `Extract`, `Card`) share structure via traits in `elements/entities/traits.rs`: all implement `Element` (`meta`) and `Tagged` (`tags`); `Extract`/`Card` also implement `Derived` (`parent`). Prefer these over duplicating per-type logic:

- `element.meta()` instead of repeating `element.meta.id / .name / .position` per type.
- `tag_strings(tagged)` instead of inlining `.tags().iter().map(|t| t.to_string()).collect()`.
- `ExtractParent`/`CardParent`'s `from_type_and_id`, `type_str()`, `id()` instead of repeating `"learning_asset" / "extract" / "folder"` match arms (`Extract` uses `ExtractParent`, `Card` uses `CardParent`, both over LearningAsset | Extract | Folder).
- Generic helpers for patterns that repeat across element types.

## Frontend Architecture (`src/`)

**React 19** with Redux Toolkit, React Router 7, and Vite.

### Key Directories

- `api/` — Typed wrappers around `invoke()` calls, mirroring backend modules (`elements`, `study`, `settings`, `sync`, `backend`, `bibliographicalSources`, `appInfo`)
- `features/` — Route-scoped feature modules, e.g. `App` (root shell), `ElementViewer` (editor/reviewer for a selected element), `Sidebar` (file tree), `Study`, `Import`, `Settings`, `Aside`, `Updater`
- `components/` — Shared cross-feature components (e.g. `Editor`, the Lexical-based rich text editor, and `AppTooltip`, the tooltip every feature uses — see UI Guidelines)
- `stores/` — Redux slices: `elements`, `elementDetails`, `user`, `sync`, `settings`, `bibliographicalSources`, `study`, `search`, `app`
- `hooks/` — Reusable hooks; notably `useApi` for loading/error state around API calls
- `managers/`, `utils/`, `config/`, `types/` — Helpers, constants, shared types

### Routing

Routes are defined in `src/router.tsx`. For type-safe navigation and param reading:

- **Navigate** using builders from `src/paths.ts` (e.g. `paths.element(type, id)`) — never interpolate route strings manually.
- **Read params** using `useElementParams()` from `src/hooks/useElementParams.ts` — returns `ElementId | null`, never call `useParams()` directly.
- When adding a new route, add a builder to `paths.ts` and update `useElementParams` if the route has params.

### Data Flow

1. Component calls a typed wrapper from `src/api/`
2. Wrapper calls `invoke("command_name", params)` (Tauri IPC)
3. Backend handler runs and returns `Result<ResponseDto, ApiError>`
4. Errors surface via `ApiError`; success updates local or Redux state

The `useApi` hook standardizes async calls via a `callApi` function. **Route each logical action through one `callApi` call** (from `useApi`/`useApiWithCustomError`), not direct `invoke()`/wrapper calls or multiple `callApi` calls per action. Always surface the resulting error in the UI near the triggering action (inline, e.g. `AuthModal`); fall back to a Mantine notification (`notifications.show(...)`) only when there's no sensible inline spot — as `src/stores/sync/syncActions.ts` does for the sync thunk, which runs outside any component.

### Backend → Frontend Request Bridge

Some backend work (e.g. producing Lexical JSON) can only be done on the frontend. `common::request_bridge::RequestBridge` (backend, DI-registered) and `useFrontendRequestBridge` (`src/hooks/useFrontendRequestBridge.ts`) together give a reusable backend-initiated request/response channel over Tauri events — the reverse of the normal `invoke()` flow:

1. Backend calls `bridge.request(app_handle, event, payload).await`, emitting `event` with `{ requestId, ...payload }` and awaiting the answer (with a timeout).
2. Frontend calls `useFrontendRequestBridge<TEvent>(event, handler)` once (e.g. in `App.tsx`); it listens for `event`, runs `handler(payload)`, and auto-reports the result via `resolve_frontend_request`. `TEvent` must extend `FrontendRequestEvent` (include `requestId`).

Event name/DTO live together under `src/api/<module>/events/` as usual (e.g. `CONVERT_MARKDOWN_TO_LEXICAL_EVENT` in `convertMarkdownToLexicalEvent.ts`) and must match the Rust `request()` call's `&str` by hand — no compile-time link. Reference implementation: `src/features/Ai/hooks/useLexicalConversionBridge.ts` + `common/services/implementations/tauri_lexical_json_converter.rs`.

### Rich Text (Lexical)

The editor uses **Lexical**, built via its extension system (`@lexical/extension`'s `defineExtension`/`buildEditorFromExtensions`), not the older plugin-array API. `src/components/Editor/editorExtension.ts` exports the shared `editorNodes`, `editorExtensionDependencies`, and static `editorTheme` used by **both**:

- `Editor.tsx` — the interactive editor (adds its own `AutoFocusExtension` config and dynamic theme entries like Shiki code-block classes)
- `lexicalJsonConversion.ts` — a headless editor (`runHeadless`) converting HTML/serialized-node fragments to Lexical JSON outside React (e.g. Import, building extract/card content from a highlight)

Keep node types, extension dependencies, and the static theme in sync between these two — a mismatch (e.g. a missing theme key like `tableScrollableWrapper`) causes divergent behavior or dev-only warnings between them. Cell content is stored and transferred as Lexical JSON.

### Command Palette (`src/commands/`)

A single registry in `commands.ts` drives the Spotlight palette (`mod+K`), global shortcuts, and in-app buttons — each command declared once, consumed everywhere.

- To add a command, look at `commands.ts` (`commandIds`, `commandGroups`, `commands`) and follow the shape of existing entries.
- To trigger a command from a component, use `useRunCommand()` rather than dispatching the underlying action directly.
- For displaying a shortcut, use `useShortcutDisplay()` (or `useCommandShortcut(id)` for a command's own shortcut) — never `formatShortcut()` directly, which doesn't know about touch input. The palette's own open shortcut is `SPOTLIGHT_SHORTCUT` in `commands.ts`.
- `CommandPalette` is mounted once in `App.tsx`. To open it elsewhere, call `spotlight.open()` from `@mantine/spotlight` — don't mount a second `<Spotlight>`.

### CSS Naming Conventions

CSS Modules are used throughout the frontend. Class names use kebab-case in `.module.css` files and camelCase when referenced in TypeScript/TSX:

```css
/* styles.module.css */
.my-class-name { ... }
```

```tsx
// Component.tsx
<div className={styles.myClassName} />
```

## Testing Conventions

These conventions apply to both Rust (`src-tauri/`) and TypeScript (`src/`) tests.

### Naming

- **Rust:** function names follow `MethodName_Scenario_ExpectedResult` in `snake_case`, e.g. `set_content_on_cloze_added_new_repetitions_correctly`
- **TypeScript:** the string passed to `it()` follows `Should <expected behavior> when <input>`, e.g. `"Should return null when id is invalid"`

### Structure

Each test is divided into three sections using AAA comments, with a blank line between each section:

```rust
#[test]
fn method_name_scenario_expected_result() {
    // Arrange

    let input = ...;

    // Act

    let actual = subject.method(input);

    // Assert

    assert_eq!(expected, actual);
}
```

```typescript
it("Should <expected behavior> when <input>", () => {
    // Arrange

    const input = ...;

    // Act

    const actual = subject.method(input);

    // Assert

    expect(actual).toBe(expected);
});
```

### File locations

- Rust: inline `#[cfg(test)] mod tests { ... }` at the bottom of the source file
- TypeScript: `src/__test__/` mirroring the source tree

### React `act()` warnings in Vitest

Two recurring causes, both a state update settling a tick after a synchronous `act()`/`fireEvent` returns:

- Fake-timer async work (e.g. a debounced auto-save): use `await vi.runAllTimersAsync()` / `advanceTimersByTimeAsync(ms)` inside `await act(async () => {...})`, not the synchronous timer variants.
- `@mantine/hooks`' `useLocalStorage`: its cross-instance sync fires via `queueMicrotask`, settling one tick late — flush with `await act(async () => {})` after the triggering render/action.

## Adding a Feature

1. **Backend:** Add entity/DTO → repository trait + SQLite impl → service → register in `create_injector.rs` → expose as a Tauri command (`<module>_api.rs`)
2. **Frontend:** Add typed wrapper in `src/api/` → build UI in the appropriate `features/` module → dispatch to Redux if global state is needed
