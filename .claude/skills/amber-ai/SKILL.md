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

Built on [`rig`](https://docs.rs/rig-core) `=0.42.0`.

- Backend: `src-tauri/src/ai_integration/` (paths below are relative to it).
- UI: `src/features/Ai/`.
- API wrappers and DTOs: `src/api/aiIntegration/`.

## Architecture

| Piece                  | File                                              | Role                                                             |
| ---------------------- | ------------------------------------------------- | ---------------------------------------------------------------- |
| Commands               | `ai_api.rs`                                       | Streaming, approvals, chats, messages, uploads                   |
| `AiStreamer`           | `services/implementations/default_ai_streamer.rs` | Runs a chat turn and persists its messages                       |
| `AgentProvider`        | `…/default_agent_provider.rs`                     | Builds the agent: preamble, context, tools                       |
| `AiClientProvider`     | `…/default_ai_client_provider.rs`                 | Settings + secrets → `MultiClient`, models, vector store         |
| `MultiClient`          | `clients/multi_client/`                           | Enum dispatch over each provider's rig client and models         |
| `ToolsProvider`        | `…/default_tools_provider.rs`                     | Builds every tool from a saved `ToolsContext`                    |
| `ApprovalHook`         | `approval_hook.rs`                                | Skips approval tools during the stream so they wait for the user |
| `ToolApprovalResolver` | `…/default_tool_approval_resolver.rs`             | Runs or rejects a pending call; writes its approval markdown     |
| Prompts                | `prompts.rs`                                      | Preamble, tool descriptions, approval result text                |

**A turn:**

1. `useAiStreaming` calls `stream_ai_response` with a channel.
2. The streamer loads the history and calls `get_agent`. That builds the tools with
   `get_tools(capture_context(..))`, then `.into_agent_tools(&messages)`, which keeps the tools
   whose `is_applicable` is true.
3. It streams `InProgress`, `ToolCall` and `ToolResult` events. Each tool call is persisted before
   its event is emitted, so it can be approved mid-stream.
4. History goes back to the model through `try_into_rig_message`. `with_current_approval_statuses`
   tells the model where each approval stands.

**Starting a turn from elsewhere:** dispatch `addAiContextSnippet(text)` and
`requestAiPrompt(prompt)` (`stores/aiContext`), then `requestFocus("aiChat")`. `AiPanel` sends the
pending prompt once it's shown and no reply is streaming. "Make Cards with AI" in the editor
(`useElementViewerButtons`) and PDF (`PdfFloatingMenu`) floating menus does this with
`CONVERT_SNIPPET_TO_CARDS_PROMPT` (`features/Ai/aiPrompts.ts`).

## Tools

**`AppTool`** (`tools/app_tool.rs`) is rig's `Tool` plus the following. `Output` must also be
`DeserializeOwned`.

- `REQUIRES_APPROVAL`: whether a call waits for the user.
- `is_applicable(messages)`: whether the agent gets the tool in this chat. Defaults to `true`.
- `approval_markdown(args)`: what the approval card asks. `None` shows the raw JSON arguments.
- `approved_markdown(args, output)`: added below it once the approved call ran, e.g. a link to
  what was created.

**`AppTools`** (`tools/app_tools.rs`) holds every tool behind `ErasedTool`, because `AppTool` isn't
object safe.

- `into_agent_tools(messages)`: the applicable tools plus the `ApprovalHook`.
- `into_tool_set()`: runs one approved call.
- `approval_markdown(name, args, output)`: returns `ApprovalMarkdown { request, result }`.

**Approval flow:**

1. The hook skips the call. The streamer stores `ToolApproval::pending(tools_context)` on it.
2. `resolve_tool_approval` rebuilds the tools from that context, runs the call, and stores the
   status plus `ToolOutput::render()`: plain text as-is, a struct `Output` as JSON.
3. The approval markdown is **never stored or sent to the model**. The resolver rebuilds the tools
   and has the tool write it each time the call reaches the frontend:
    - in `MessageResponseDto` as `approvalMarkdown` and `approvalResultMarkdown`;
    - in the stream's `ToolCall` event (request only).
4. On the frontend, `buildDisplayMessages` puts them on `approval.markdown` and
   `approval.resultMarkdown`, which `ToolApprovalCard` renders. After the user resolves a call,
   `AiPanel.resolvedApprovals` overrides the loaded status and result until the chat reloads.

**Element links:** `element_reference(element_id)` (`tools/element_reference.rs`) emits an
`<element-ref>` tag. `AiMarkdown` renders it as a link labelled with the element's current name,
in both approval cards and assistant replies.

- The model writes the tags itself. `element_reference_instructions()` in `prompts.rs` teaches the
  format in every preamble.
- The model only gets ids from the context (the open element's tag) and from tool results (e.g.
  `cardId`). Give new tools' outputs ids for anything they create or find.
- The tag name is mirrored by hand in `src/api/aiIntegration/elementReference.ts`. Put a blank line
  before `---` or headings, or the previous line becomes a heading.

## Adding a tool

1. **Create `tools/<name>.rs`.** Copy `create_card.rs` (approval tool that creates),
   `finish_extract.rs` (approval tool on the open element, offered only for extracts) or
   `search_documents.rs` (conditional tool).
    - The args struct derives `Deserialize, Serialize, JsonSchema`, with a
      `#[schemars(description)]` on each field.
    - Use a `thiserror` error enum.
    - Hold dependencies as `Arc<dyn Service>`.
    - `call()` goes through services, never repositories directly, so events and sync still fire.
      The UI refreshes from those events (e.g. `finish` pushes `elementDueChanged`, which reloads
      the element details), flushed when the approval's scope saves. Use the app's own wording
      (e.g. "finished", not "done").
    - `NAME` is persisted, so never rename it.
    - For `approved_markdown`, return a typed `Output` struct carrying ids (camelCase) rather than
      parsing text.
    - To act on the open element, take it from the provider rather than from args, so the model
      can't pick another one. Element ids in args need `#[schemars(with = "String")]`.
2. **Description:** add it as a const in `prompts.rs`, and update `PREAMBLE_BASE` if the
   assistant's behaviour should change.
3. **Register it:** add the module to `tools/mod.rs`, and `.tool(...)` it unconditionally in
   `DefaultToolsProvider::get_tools`. Applicability belongs in `is_applicable`. Register any new
   dependency in `create_injector.rs`. Add a field to `ToolsContext` only for data the messages
   can't provide, and make it `#[serde(default)]`.
4. **Frontend:** add an icon to `TOOL_ICONS` in `MessageBubble.tsx` and a line to
   `AiCapabilitiesModal.tsx`. Approval tools need nothing else.
5. **Tests:** cover `call` against `create_test_injector`, the markdown methods and
   `is_applicable`. Add a `get_agent_*` test if it changes what the agent is offered.

Running tools are never cancelled, so keep `call` bounded and its output short.

## Adding a provider

First check `rig::providers::<name>` exists in rig 0.42.

1. **`settings/value_objects/ai_provider.rs`:** add the variant to `AiProvider`, to `ALL`, to
   `api_key_secret()` (`None` if the provider takes no key) and to `Display`. The serde name is
   persisted, so never rename it.
2. **`clients/multi_client/`:** add a `#[cfg(not(test))]` arm to every enum and `match` in
   `multiclient.rs`, `multi_completion_model.rs` and `multi_embedding_model.rs`. Adapt requests
   there if needed, like OpenAI's `without_temperature`.
3. **`DefaultAiClientProvider::get_client`:** build the client, using `get_api_key` for keyed
   providers.
4. **Frontend:** add the name to the `AiProvider` union in `settingsDto.ts`, add an entry to
   `providers` in `AiTab.tsx` and update its tooltip, then update the Settings tests.

Tests only compile `MultiClient::Mock`, so check the new arms with `cargo build --features wry`,
then try them in `npm run tauri dev`.

## Testing

- **`MockClient`** (`clients/mock_client.rs`): script it with `completion_fn`, `stream_fn` (switch
  on a call counter for multi-turn tool use) and the embedding fields.
- **Run:** `cargo test --features wry --lib ai_integration` and
  `npx vitest run src/__test__/features/Ai`.

## Gotchas

- Always pass `--features wry`.
- Rust and TS DTOs and event names are mirrored by hand.
- Persisted JSON is long-lived. New fields on `ToolCallContent`, `ToolApproval`, `ToolsContext`,
  or a tool's `Output` need `#[serde(default)]` or `Option`. Prefer computing display data on
  demand over storing it.
- The AI panel and element info share the aside's tabs, which hide inactive panels in React
  `<Activity>`, dropping their effects. Listeners for events a tool causes (e.g.
  `useElementDueChangedRefresh`) must live in `App.tsx`, not in a tab.
- Some providers return empty tool-call ids; the streamer falls back to rig's `internal_call_id`.
- The streamer commits before the LLM round-trip and after each tool call. Keep that pattern for
  new writes in the stream loop, or SQLite will hit `SQLITE_BUSY_SNAPSHOT`.
