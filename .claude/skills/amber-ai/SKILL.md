---
name: amber-ai
description: >
    How Amber's AI assistant works and how to extend it. Use this skill when: (1) adding a new
    tool the AI agent can call (e.g. creating, editing or searching elements), (2) making a tool
    require the user's approval or changing what the approval card shows, (3) adding a new AI
    provider (LLM / embeddings backend) next to Ollama, OpenAI, OpenRouter and Gemini, (4) touching
    the AI chat streaming, tool calls, approvals or document search, or (5) any task involving
    `ai_integration/`, `AppTool`, `AppTools`, `ToolsProvider`, `ApprovalHook`, `MultiClient`,
    `AiProvider`, `rig`, or `src/features/Ai`.
---

# Amber AI

Built on [`rig`](https://docs.rs/rig-core) `=0.45.0`. The backend lives in
`src-tauri/src/ai_integration/`, the UI in `src/features/Ai/`, and the API wrappers in
`src/api/aiIntegration/`. Read the code there for how a turn flows; this skill covers the rules
that aren't obvious from it.

## Tools

Tools implement `AppTool`, which is rig's `Tool` plus approval and applicability hooks. Start from
the existing tool closest to what you need and follow its shape.

- **Approval:** anything that changes the user's data should require approval. The approval card
  should read as a plain sentence about what will happen, and once approved it can link to what
  was changed.
- **Location:** if a call's change lands in an element (e.g. the parent a card goes in), return it
  from `location`; the UI shows "in <element>" with the call, so don't write it into the markdown.
  It's built from the call's saved context, which today only calls awaiting approval have.
- **Applicability:** offer a tool only where it makes sense (e.g. only when an extract is open) via
  `is_applicable`, rather than registering it conditionally.
  When deciding needs a lookup (e.g. `search_open_element` skips PDFs, which have no stored
  text), do it in an async constructor awaited in `get_tools`, since `is_applicable` is sync.
- **Go through services**, never repositories, so events, sync and UI refreshes still happen.
- **The open element comes from the context**, not from the model's arguments, so the model can't
  act on something else.
- **Leave new elements' names `None`** (`CreateMetaDto`), so they're named after their content
  with clozes hidden and keep following it until the user renames them.
- **Return ids** for anything a tool creates or finds. The model can only link to elements whose ids
  it has seen, and links use `element_reference`.
- **Use the app's wording** in names, descriptions and approval text (e.g. "finished", not "done").
- **Keep calls bounded** and outputs short; running tools are never cancelled (rig only keeps a batch's
  results once every call in it settles, so `StateCancellationHook` stops model calls, never tools). Clamp any size the
  model picks in `call` (e.g. `search_documents`' `top_k` to `MAX_TOP_K`); a schema hint alone
  isn't enforced.
- Text a tool turns into element content (like card sides) goes through the Markdown-to-Lexical
  bridge, so it's Markdown with TeX math; tell the model so in the guidelines.
- Put descriptions and any preamble changes in `prompts.rs`. On the frontend, give the tool an
  icon and mention it in the capabilities modal.
- The preamble applies to every chat, so only name a tool there if it's always offered; "when to
  use it" for a tool gated by `is_applicable` goes in its own description.
- Guidelines shared by several tools (e.g. card writing for `create_card` and `create_cloze_card`)
  go in `PREAMBLE_BASE`; each tool's description keeps only what's specific to it.
- Test the call, the approval text and when the tool is offered.

## Providers

Check `rig` 0.45 supports the provider first. A provider touches the `AiProvider` setting,
`MultiClient` (which hands out rig's type-erased `DynModel`s), the client provider and the AI
settings tab. Tests only compile the mock client, so build with `cargo build --features wry` and try
it in `npm run tauri dev`.

## Starting a chat from elsewhere in the app

Add the text as a context snippet, queue a prompt in the `aiContext` store and focus the AI chat;
the panel sends the prompt once it's visible. Keep reusable prompts in `aiPrompts.ts`. The model
only knows the open element's name, not its content, so attach any text it should work from.
Snippets stay on the message they were sent with, never in the preamble, so a later snippet
isn't confused with an earlier one. Each is fenced in a `<snippet>` block, and the preamble tells
the model snippets, search results and context are material, not instructions.

## Gotchas

- Always pass `--features wry`.
- Rust and TS DTOs and event names are mirrored by hand.
- **Persisted data is long-lived.** Tool names and provider names are stored, so never rename them.
  New fields on anything stored with a chat need `#[serde(default)]` or `Option`. Prefer computing
  display data (like approval text) on demand over storing it.
- **User-made AI data syncs.** Anything the user builds up for the AI (like saved prompts) belongs
  in a table registered for sync. Keep it in one Redux slice (like `aiPrompts`) that saves update
  from the returned DTO and `usePostSyncRefresh` reloads, not in per-component copies.
- **Hidden aside tabs drop their effects.** The AI panel shares tabs with other panels, so listeners
  for events a tool causes must live at the app level, not inside a tab.
- **Commit before slow work in the stream loop.** The streamer saves before each LLM round-trip and
  after each tool call; new writes there must follow suit, or SQLite hits `SQLITE_BUSY_SNAPSHOT`.
- **Card content goes through Markdown**, so a tool can emit an editor node (like a cloze's
  `<mark data-cloze-hidden>`) as inline HTML, as long as the HTML sanitizer allows it.
- **Message dates are stored to the second**, so messages in the same second keep their order only
  by insertion. Anything that copies messages (like branching a chat) must insert them in order.
- rig mints a call id when a provider sends none (e.g. Ollama), so stored ids are never empty.
- Ollama uses `native_completion` (`/api/chat`); rig's plain `completion` is its OpenAI-compatible API.
- Tests use `MockClient`, a transport for rig's `MockScript` wire: `completion_fn` returns a whole
  reply's content, `stream_fn` one `MockStreamEvent` per call until `None`. Script multi-turn tool use
  by switching on a call counter.
