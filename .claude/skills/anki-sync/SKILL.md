---
name: anki-sync
description: >
    How Amber's two-way sync with Anki desktop works and how to change it. Use when touching
    `src-tauri/src/anki_sync/`, AnkiConnect calls, the sync's preview or summary, how cards, edits,
    reviews, due dates, decks or deletions travel between Amber and Anki, or the frontend's
    `features/AnkiSync`, `stores/ankiSync`, `api/ankiSync` or the Settings `AnkiTab`. Not for cloud
    sync between Amber devices (`sync/`).
---

# Anki sync

Amber talks to a running Anki desktop over **AnkiConnect** (`anki_connect.rs`, localhost HTTP).
`active_profile` first asks `apiReflect` for every action the sync uses (`REQUIRED_ACTIONS`) and refuses an
older add-on with `AnkiConnectError::Outdated`; add any new action there.

One service, `DefaultAnkiSyncService`, runs everything. Each phase lives in its own file under
`services/implementations/default_anki_sync_service/`, and `sync()` reads top to bottom in write order.

## Flow

1. **Preview** (`preview_anki_sync`): `plan()` reads both sides and changes nothing. The frontend always
   opens `AnkiSyncReviewModal` first (`startAnkiSync` in `stores/ankiSync/ankiSyncActions.ts`), at once with a
   loader (`review.status`: `loading`, then `ready` or `failed`). It shows decks to import, Amber's decks being
   sent, how many cards Amber's edits update, reviews going each way (`count_reviews`, over
   `NoteChanges::cards_to_pair` as the sync pairs them) and deletions.
2. **Sync** (`sync_anki`, with the deck choices), in this order:
    - `plan.rs`: plan, then trash cards deleted in Anki and remove notes deleted in Amber.
    - `import_decks.rs`: import the chosen decks' new cards (exported as `.apkg`, run through the importer).
      Imported cards are due from today (`NewCardDue::On`), as Anki shows a new card right away.
    - `pull_edits.rs`, then `refresh_imported.rs`: Anki's edits come back, before the export.
    - `export.rs`, then `push.rs`: changed notes go to Anki as one `.apkg` through Anki's own importer.
    - `review_sync.rs`: reviews and due dates, both ways.
    - Pairs (`anki_paired_cards`) and the last-synced time are saved last.

Commit between phases (`self.commit()`), as a reading transaction goes stale over slow Anki and frontend
calls. Writes to Anki can't be undone, so they come after the Amber writes they depend on are committed.
`AnkiSyncLock` allows one sync at a time and handles cancelling; call `check_cancelled()` between long steps.

## Notes and edits

- **Identity.** Amber's notes use the `Amber Basic` / `Amber Image Occlusion` notetypes
  (`package/definitions.rs`); a basic note's guid is the card's hyphenated id. Cards imported from Anki keep a
  link (`AnkiCardLinkRepository`) to their original card and are paired with it, never exported. A sync sets
  the link's cloud-synced `synced` column (`replace_paired_cards`), which the card view's "edit in Anki"
  warning reads on every device, as `anki_paired_cards` stays on the syncing one.
- **Change detection.** `fingerprint()` (`notes.rs`) hashes the fields (as Lexical JSON, before rendering),
  tags and card ords; the deck is compared separately. An unchanged note is never rendered or sent.
  `EXPORT_VERSION` is stored beside each record (`anki_exported_notes`): bump it when the rendered output
  changes, and notes are resent without counting as edits (`NoteChanges::amber_edits`).
- **Amber's cards: the later edit wins.** Anki keeps the `mod` an import gives a note, so a later `mod` means
  an edit in Anki (`plan.edited_in_anki`). `takes_anki_edit` takes it unless `cards.content_modified_at` (set
  by a trigger that skips cloud sync's applies) is later. A taken edit goes through `convert_math` first, as
  an import does, so MathJax comes back as equations.
    - An edit that leaves the card as it was (a tag added in Anki, say) isn't sent back; its record takes the
      edit's time (`seen_edits`), so the next sync doesn't take it again.
    - Such an edit is found by rendering the card and comparing it with Anki's sides (`edits_to_sides`), never
      by converting Anki's HTML back: that round trip isn't exact (tables, links), so it would replace the card.
- **Amber's occlusions: Amber only.** Amber draws them, so an occlusion note Anki edited since it was last
  sent (`plan.occlusions_edited_in_anki`) is sent again, dated after Anki's edit so its importer takes it, and
  counted as an edit sent to Anki.
- **Imported cards: Anki only.** Amber never writes their notes. One whose fields changed since the last sync
  is rendered again from an exported package, as the importer would (`refresh_imported.rs`).
    - `anki_imported_notes` keeps each note's `fields_hash` (a deck import records them, read before its
      export), so a tag or deck change in Anki isn't an edit. Only a note without a hash falls back to its `mod`.
    - The hash decides, not `mod`, as an edit made on another device before the last sync can reach this Anki
      after it. So the `edited:` search reaches `LATE_EDIT_DAYS` further back than the last sync, plus a day
      as Anki counts its days from the end of today (`edited_days`).
    - The card viewer shows its "edit in Anki" notice only for synced imports (`is_card_synced_from_anki`).
- **Imported occlusions: masks only, Anki's own notetype only.** A changed native note
  (`plan.imported_occlusions_changed_in_anki`) is read as the importer would and its masks applied through
  `ImageOcclusionService::update`, which keeps unchanged masks' cards, creates cards for new ones and trashes
  removed ones; new cards are then linked to their Anki card by target key (`refresh_imported_occlusions`).
  Its cards are kept out of the plan's new cards, so a mask added in Anki isn't offered as an import. An image
  replaced in Anki isn't taken, and the add-on's occlusions (a note per mask) aren't refreshed.
- **Decks.** The importer records each folder's full deck name (`folders.anki_deck`, e.g. `Spanish::Verbs`).
  A card goes to its nearest such folder's deck, wherever that folder sits in Amber, with folders made in
  Amber below it as subdecks; anything above it stays out of Anki. Moving or renaming an imported folder in
  Amber changes nothing in Anki. A tree made in Amber goes under an `Amber` deck. `deck_name_under` (the
  export) and `folder_paths` (where imports land) share this rule in `deck_path`.

## Reviews and due dates

- **One decision per card.** `card_decision::decide` works out, for each pair, the reviews each side lacks,
  whether Anki answers Amber's newest one, and whose due date wins. Both `preview` (through `count_reviews`)
  and `prepare_reviews` call it, so the preview counts exactly what the sync does.
- **One timeline per card.** `card_timeline::CardTimeline` lists every review, due move and reset from both apps
  (Anki's log entries sorted by kind, Amber's from its logs, `due_moved_at` and `reset_at`). `decide` reads a
  `Verdict` from it, in this order: a reset in Anki, a reset in Amber, a due move, else the reviews decide. Due
  moves are read two ways: when both apps hold the card by the day, by which app's day changed since the last
  sync (`schedule_to_take`); otherwise by which app moved it last (`moved_last`, in `moved_without_a_due_day`).
  Add a new rule as a question to the timeline, not by re-deriving times from the raw logs.
- **Merging reviews.** Logs merge by the second (`reviews.rs`). A pulled review's id is a UUIDv5 of its card
  and second (`pulled_review_id`), so two devices pulling the same Anki review make one row in cloud sync.
  Anki's revlog keeps deleted cards' reviews, so `insert_reviews` moves a clashing id to a free millisecond of
  the same second.
- **Rescheduling.** A card that got reviews is rescheduled by replaying its whole history with ts-fsrs on the
  frontend (`REPLAY_CARD_REVIEWS_EVENT` over the request bridge). The side that reviewed last decides the due
  date, unless a due date moved by hand since the last sync is newer than every review
  (`moved_after_every_review`): that move wins, while the replay still sets the memory state. Amber's move
  time is `card_reviews.due_moved_at` (a trigger, skipped by cloud sync's applies), Anki's its newest manual
  or rescheduled revlog entry. A card's first sync has no baseline, so any move after every review counts,
  such as a due date set in Anki before the import. Logged reviews don't add to Anki's `reps`/`lapses`, so a
  card that got them but keeps Anki's schedule takes Amber's counts (`counts_in_anki`).
- **Learning steps from Amber.** AnkiConnect can't set learning steps, so a card Amber reviewed last and left
  (re)learning is answered in Anki with Amber's rating (`answer_cards`, `answerCards`) rather than logged
  (`answers_in_anki`), and starts Anki's own steps. A card Anki has graduated is only answered Again;
  suspended or buried cards never are.
    - Amber's Again on a card Anki still holds as new or learning (its earlier reviews reached Anki only as
      logs) first makes it a review due today (`setDueDate "0!"`, `CardDecision::lapse_in_anki`), so Anki
      relearns it with a lapse rather than restarting the new-card steps.
    - Anki logs the answer at the sync's time, so `anki_answered_reviews` maps it to Amber's second
      (`match_answered_reviews`, before every merge). That table is cloud-synced, keyed by Anki's review id as
      text, as AnkiWeb gives every device's Anki the answer.
    - A card Anki refuses to answer is logged and gets Amber's schedule instead; one that isn't answered comes
      due today in Anki as a review.
- **Due dates moved without a review.** Each pair stores both apps' due day at the last sync (`amber_due`,
  `anki_due`); the side that moved it wins (`schedules.rs`), and the preview and summary count these moves
  (`due_dates_to_anki`/`due_dates_to_amber`). Anki's due date is never taken when it falls before the card's
  last review (`AnkiNextReview::apply_to`).
- **Writing Anki's schedule.** Use `setDueDate`, as AnkiConnect refuses direct `due`/`queue` writes.
  `setDueDate` can't set a past day, so a card overdue in Amber is due today in Anki, and the two count as
  agreeing (`schedule_to_take`). It also puts a suspended card back in the review queue, so
  `schedule_in_anki` suspends those again.
- **Anki's days.** AnkiConnect doesn't report Anki's today, so `anki_today` finds it with a binary search over
  `prop:due`. The rollover hour is assumed to be 4am.
- **(Re)learning cards** have no due day to store, so when either app holds a card by the minute, the sync
  compares Anki's days instead (`anki_due_date`: a due time before 4am counts as the day before). A due date
  moved by hand that is the newest thing either app did to the card wins (`moved_without_a_due_day`), as
  Amber's `set_due` keeps `scheduled_days` at 0 and Anki's "Set due date" turns a learning card into a review.
- **Scheduled only in Amber.** A card Anki holds as new though Amber scheduled it, with nothing in Anki's log
  after Amber's last review, takes Amber's schedule (`scheduled_only_in_amber`): its reviews reached Anki but
  the due date didn't, or was undone there (Anki's undo reverts `setDueDate`, not `insertReviews`).
- **Resets in Anki.** "Forget" logs a manual entry with no interval (`is_reset`; a set due date logs a day or
  more). When the reset is later than anything Amber did to the card and Anki has only reviewed it since (or
  still holds it as new), Amber resets the card too (`reset_in_amber`, counted as a due date to Amber). Reviews
  either side lacks still travel as logs, and only Anki's reviews since the reset are replayed, from a new card.
  A card Amber holds as new is reset too when its newest event is a due move; applying that clears
  `due_moved_at` (`clear_due_moved`), so the reset is taken once.
- **Resets in Amber.** A reset writes `card_reviews.reset_at` itself (`mark_reset`), not through a trigger, so
  cloud sync's applies keep its device's time and the sync's own resets don't set it. When it's later than
  every entry in Anki's log and Anki still schedules the card, Anki forgets it (`forgetCards`,
  `amber_reset_last`, counted as a due date to Anki) and a suspended one is suspended again. Anki's reviews
  from before the reset are only logged; a due date Amber moved after the reset follows the forget.
- **New cards.** Neither app has a due day to store for one Amber holds as new, so `moved_without_a_due_day` compares
  Anki's days: the newest move wins, as long as nothing came after it. Amber keeps the card new and only moves
  its due date, while Anki's `setDueDate` makes it a review card, so `AnkiSchedule::values` is None for it.

## Deletions and transport

- **Deletions need proof.** Only a tombstone on a card that's gone proves Amber deleted it (`deleted_rows`); a
  card that came back keeps its old tombstone. Trashing alone changes nothing in Anki; deleting from the trash
  deletes the note (or suspends the card while its note has others). A card deleted in Anki moves to Amber's
  trash. Cards in filtered decks wait until they're back.
- **Progress** goes through `SyncFrontend` / `ankiSyncProgress`, not the `EventManager`, which only flushes on
  commit.
- **Packages travel through Anki's media folder** (`transfer.rs`), never a temp path, as either app may be
  sandboxed (Amber ships as a Flatpak, Snap and MSIX).
    - When Anki confirms it sees Amber's file (`getMediaFilesNames`), Amber writes and reads there directly.
    - Otherwise it sends packages as base64 (`storeMediaFile`), split by `write_packages` under
      `SENT_PACKAGE_BYTES` as AnkiConnect refuses requests over 16 MiB, and reads an export back with
      `retrieveMediaFile`.
    - Every package is removed afterwards, even on failure; Anki trashes any Amber couldn't delete, as one left
      behind would sync to AnkiWeb.

## Several devices

Each device keeps its own records of a profile (sent notes, pairs, last sync, deck choices); only
`anki_card_links`, `anki_answered_reviews` and `folders.anki_deck` are cloud-synced. So the frontend
cloud-syncs before the preview and after the Anki sync (`syncWithOtherDevices` in `ankiSyncActions.ts`), and
another computer sees what this one took from Anki before taking it again. When the account syncs but that
first sync couldn't run (offline, already syncing, failed), the review gets `missedCloudSync` and warns that
ticked decks may be imported twice. Keep anything that must agree across devices deterministic or synced.

## Changing it

- Keep `preview()` counting things the way `sync()` does: share the rule (as `NoteChanges::amber_edits` does)
  rather than writing it twice.
- Never edit a migration that shipped in a release tag (`0017_…anki_sync_tables.sql` did, in v0.23.0); add a
  new one. One not yet released can still change; then `touch src-tauri/build.rs` so `sqlx::migrate!`
  re-embeds it.
- Tests are in `default_anki_sync_service/tests.rs`, against `FakeAnki`, which answers AnkiConnect actions
  from in-memory notes, cards, schedules and media; add a handler there for any new action.
    - `media_access` sets how Amber sees Anki's media folder: `Unreachable` (the default), `Shared` or
      `Redirected`.
    - Its `importPackage` applies a package as Anki's importer does (`AnkiCollection::import`: a held note
      changes only when the package's is newer, cards keep their decks).
    - Two-computer tests use `device` and `cloud_sync`; `sync_with_anki` commits like the command does.
    - The HTML round trip an edit makes is pinned in `src/__test__/features/AnkiSync/htmlRoundTrip.test.ts`.
- Frontend: DTOs in `src/api/ankiSync/`, the modal and progress in `src/features/AnkiSync/components/`,
  summary text in `ankiSyncSummary.ts`, and the user-facing rules in `SYNC_RULES` in
  `src/features/Settings/components/AnkiTab.tsx`. Update those rules when behaviour changes.
