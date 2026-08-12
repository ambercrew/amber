# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Amber is a Tauri 2 desktop app (React 19 frontend, Rust backend) for incremental learning.

## UI Guidelines

- Use **Mantine** (`@mantine/core`, `@mantine/hooks`) components for all UI. Prefer built-in Mantine components over building custom ones.
- Use **`@phosphor-icons/react`** for icons.
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

`Cargo.toml` deliberately has **no default runtime feature** — each platform's `tauri.<platform>.conf.json` opts into its own runtime via `build.features`: **CEF on Linux, WRY everywhere else** (Windows, macOS, Android). Because of this, running bare `cargo build`/`cargo test`/`cargo clippy` without `--features wry` (or `--features cef`) fails to compile (`tauri::Wry` not found). Always pass `--features wry` for local Rust dev/CI, regardless of host OS. Never add a `default` feature to fix this — it would silently combine with whatever a platform's config already opts into.

The `[patch.crates-io]` block in `Cargo.toml` redirects `tauri` and all `tauri-plugin-*`/`tauri-runtime-wry` crates to a `feat/cef` branch fork (for CEF runtime support not yet in upstream Tauri). Keep this in mind when debugging anything that looks like an upstream Tauri bug — behavior may differ from the published crate.

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

Bulk-operation commands (e.g. those driven by `src/features/ElementsBrowser`'s results action bar — reschedule, tags, set source, delete, etc.) always take an explicit list of element ids from the frontend, never the saved search/filter query that produced them. The frontend resolves the query to concrete `ElementId`s (from the already-fetched search results) before invoking the bulk command; the backend has no knowledge of `ElementFilter`/search state and only ever receives ids to act on.

### Event Manager (`common/event_manager.rs`)

The `EventManager` trait (implemented by `TauriEventManager`, `common/services/implementations/tauri_event_manager.rs`) lets services queue frontend-bound events during a request scope without emitting them immediately. Services call `event_manager.push(name, body)` (e.g. `ELEMENT_CREATED_EVENT` in `default_element_creation_service.rs`); identical `AppEvent`s are deduplicated and buffered rather than sent right away. The buffered events are only flushed — via `emit_all()`, which emits each one through `AppHandle::emit` — from inside `SqliteTransactionManager::save_changes` (`infrastructure/managers/sqlite/sqlite_transaction_manager.rs`), right after the DB transaction commits, and reached through the same `UnitOfWorkExt::save_changes` call shown above. This ties event emission to the Unit-of-Work commit so the frontend never observes an event for a change that didn't actually persist (e.g. because the transaction was rolled back or an earlier step in the scope failed).

### Domain Modules

- **elements** — Core content tree: `Folder`, `LearningAsset`, `Extract`, `Card` (see Element Duplication below)
- **study** — FSRS spaced-repetition scheduling (study profiles, card grading) and the global review-priority queue (`MetaRepository`'s priority-ordering methods)
- **bibliographical_sources** — Registry of original works (book, article, video, etc.) that elements are imported from; one `BibliographicalSource` is shared by every element derived from it (`Meta::bibliographical_source_id`). The UI pairs it with the per-element `derived_from` lineage under the umbrella term **origin**
- **import** — PDF/HTML/URL content import pipeline (extraction, conversion to elements)
- **backend** — Remote auth (sign-up, sign-in, etc.)
- **secrets** — `SecretsRepository` trait for reading/writing OS-level secrets; keyring implementation lives in `infrastructure/repositories/keyring/`
- **settings** — User preferences
- **local_configurations** — Per-machine config not synced to the cloud (e.g. database location)
- **sync** — Cloud sync via protobuf messages
- **backup** — Background auto-backup service
- **app_info** — Small app-level queries (e.g. store-build detection)
- **database** — SQLite connection management

### Naming Conventions

- DTOs: `*RequestDto`, `*ResponseDto` (used at the API boundary)
- Entities: plain struct names
- Repository traits live in `repositories/`, implementations in `repositories/infrastructure/sqlite/`
- Error types use `thiserror`; all commands return `Result<T, ApiError>`

### Events

Backend → frontend event names and their payloads live under a module's `events/` directory (e.g. `elements/events/element_created_event.rs`, `common/events/convert_markdown_to_lexical_event.rs`), never in `dto/` or inlined in a service. Each event gets its own file containing both the name constant and its payload struct together — e.g. `ELEMENT_CREATED_EVENT` and `ElementCreatedEventDto` both live in `elements/events/element_created_event.rs`. The frontend mirrors this: the event name constant and its DTO type live together in `src/api/<module>/events/<eventName>.ts` (e.g. `CONVERT_MARKDOWN_TO_LEXICAL_EVENT` and `ConvertMarkdownToLexicalEventDto` in `src/api/common/events/convertMarkdownToLexicalEvent.ts`), placed in whichever module's `api/` directory matches where the Rust event lives (`common/events/` → `src/api/common/events/`). Keep the event name string identical on both sides by hand — there's no compile-time link across the language boundary.

### Element Duplication

Elements (`Folder`, `LearningAsset`, `Extract`, `Card`) share significant structure — all implement `Element` (for `meta`) and `Tagged` (for `tags`); `Extract` and `Card` also implement `Derived` (for `parent`). These traits live in `elements/entities/traits.rs`. Avoid duplicating logic that can be expressed through these traits:

- Use `element.meta()` (via `Element`) instead of repeating `element.meta.id / .name / .position` patterns across element types.
- Use `tag_strings(tagged)` or equivalent helpers rather than inlining `.tags().iter().map(|t| t.to_string()).collect()` per element.
- Use `ExtractParent::from_type_and_id` / `CardParent::from_type_and_id` and their `type_str()` / `id()` methods instead of repeating the `"learning_asset" / "extract" / "folder"` match arms. `Extract` uses `ExtractParent` (LearningAsset | Extract | Folder); `Card` uses `CardParent` (LearningAsset | Extract | Folder).
- Use generic helpers for patterns that repeat over different element types.

## Frontend Architecture (`src/`)

**React 19** with Redux Toolkit, React Router 7, and Vite.

### Key Directories

- `api/` — Typed wrappers around `invoke()` calls, mirroring backend modules (`elements`, `study`, `settings`, `sync`, `backend`, `bibliographicalSources`, `appInfo`)
- `features/` — Route-scoped feature modules, e.g. `App` (root shell), `ElementViewer` (editor/reviewer for a selected element), `Sidebar` (file tree), `Study`, `Import`, `Settings`, `Aside`, `Updater`
- `components/` — Shared cross-feature components (e.g. `Editor`, the Lexical-based rich text editor)
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

The `useApi` hook standardizes async calls.

### Backend → Frontend Request Bridge

Some backend work (e.g. producing Lexical JSON) can only be done on the frontend. `common::request_bridge::RequestBridge` (backend, DI-registered) and `useFrontendRequestBridge` (`src/hooks/useFrontendRequestBridge.ts`, frontend) together provide a reusable backend-initiated request/response channel over Tauri events — the reverse direction of the normal `invoke()` flow above:

1. Backend calls `bridge.request(app_handle, event, payload).await`, which emits `event` with `{ requestId, ...payload }` and awaits the frontend's answer (with a timeout).
2. Frontend answers it by calling `useFrontendRequestBridge<TEvent>(event, handler)` once (e.g. in `App.tsx`) — it listens for `event`, runs `handler(payload)`, and reports the result back via the generic `resolve_frontend_request` command automatically. `TEvent` must extend `FrontendRequestEvent` (i.e. include `requestId`).

Event name constants and the event's DTO type live together under `src/api/<module>/events/` (see Events under Naming Conventions above, e.g. `CONVERT_MARKDOWN_TO_LEXICAL_EVENT` and `ConvertMarkdownToLexicalEventDto` in `src/api/common/events/convertMarkdownToLexicalEvent.ts`) — the event name string must match the `&str` the corresponding Rust `request()` call uses; there's no compile-time link across the language boundary, so keep them in sync by hand. See `src/features/Ai/hooks/useLexicalConversionBridge.ts` and `common/services/implementations/tauri_lexical_json_converter.rs` for the reference implementation.

### Rich Text (Lexical)

The editor uses **Lexical**, built via its extension system (`@lexical/extension`'s `defineExtension`/`buildEditorFromExtensions`) rather than the older plugin-array API. `src/components/Editor/editorExtension.ts` exports the shared `editorNodes`, `editorExtensionDependencies`, and static `editorTheme` used by **both**:

- `Editor.tsx` — the interactive editor (adds its own `AutoFocusExtension` config and dynamic theme entries like Shiki code-block classes)
- `lexicalJsonConversion.ts` — a headless editor (`runHeadless`) used to convert HTML/serialized-node fragments to Lexical JSON outside of React (e.g. for Import and for building extract/card content from a highlight)

Keep node types, extension dependencies, and the static theme in sync between these two consumers — a mismatch (e.g. a theme key some extension needs, such as `tableScrollableWrapper`) causes divergent behavior (or dev-only console warnings) between the interactive editor and the headless conversion path. Cell content is stored and transferred as Lexical JSON.

### Command Palette (`src/commands/`)

A single command registry in `commands.ts` drives the Spotlight palette (`mod+K`), global keyboard shortcuts, and any in-app buttons — each command is declared once and consumed everywhere.

- To add a command, look at `commands.ts` (`commandIds`, `commandGroups`, `commands`) and follow the shape of existing entries.
- To trigger a command from a component, use `useRunCommand()` rather than dispatching the underlying action directly.
- For displaying a shortcut, use `formatShortcut()`; the palette's own open shortcut is `SPOTLIGHT_SHORTCUT`, both in `commands.ts`.
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

Two recurring sources of "not wrapped in act(...)" warnings in this codebase, both caused by state updates that settle a tick after a synchronous `act()`/`fireEvent` call returns:

- Fake-timer-driven async work (e.g. a debounced auto-save that awaits an API call): use `await vi.runAllTimersAsync()` / `await vi.advanceTimersByTimeAsync(ms)` inside `await act(async () => { ... })` instead of the synchronous `vi.runAllTimers()`/`vi.advanceTimersByTime()`.
- `@mantine/hooks`' `useLocalStorage`: its cross-instance sync event is dispatched via `queueMicrotask`, so a functional state update settles one microtask tick later. Flush it with `await act(async () => {})` after the triggering render/action.

## Adding a Feature

1. **Backend:** Add entity/DTO → repository trait + SQLite impl → service → register in `create_injector.rs` → expose as a Tauri command (`<module>_api.rs`)
2. **Frontend:** Add typed wrapper in `src/api/` → build UI in the appropriate `features/` module → dispatch to Redux if global state is needed
