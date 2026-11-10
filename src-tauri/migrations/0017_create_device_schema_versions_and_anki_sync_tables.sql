-- The latest migration each device has applied. A device behind the newest one stops syncing.
CREATE TABLE device_schema_versions(
    device_id TEXT NOT NULL PRIMARY KEY,
    version INTEGER NOT NULL
);

-- A card imported from an Anki collection, paired with the Anki card it came from so syncing doesn't export it again.
-- Outlives the card on purpose: it's what stops syncing from importing a card deleted in Amber again.
CREATE TABLE anki_card_links(
    card_id         TEXT        NOT NULL        PRIMARY KEY,
    anki_card_id    INTEGER     NOT NULL
);

-- Per device, not synced: what each note last sent to a profile held, so a change Amber has no timestamp for
-- (tags, masks, a folder rename) still gets a newer modification time.
CREATE TABLE anki_exported_notes(
    profile         TEXT        NOT NULL,
    guid            TEXT        NOT NULL,
    fingerprint     TEXT        NOT NULL,
    version         INTEGER     NOT NULL,
    deck            TEXT        NOT NULL,
    modified        INTEGER     NOT NULL,
    PRIMARY KEY (profile, guid)
);

-- Per device, not synced: a hash of each imported note's fields when a sync last read it, so a note whose tags
-- or deck alone changed in Anki doesn't count as edited.
CREATE TABLE anki_imported_notes(
    profile         TEXT        NOT NULL,
    note_id         INTEGER     NOT NULL,
    fields_hash     TEXT        NOT NULL,
    PRIMARY KEY (profile, note_id)
);

-- Synced: Anki's reviews made by answering a card for one of Amber's, which Anki logs at the sync's time;
-- each is matched to the second of Amber's review it stands for. Shared, as another device's Anki gets the
-- same review through AnkiWeb. Keyed by Anki's review id, as text so cloud sync can key it.
CREATE TABLE anki_answered_reviews(
    anki_review_id      TEXT        NOT NULL        PRIMARY KEY,
    amber_reviewed_at   INTEGER     NOT NULL
);

-- Per device, not synced: each Anki profile's last sync.
CREATE TABLE anki_profiles(
    profile         TEXT        NOT NULL        PRIMARY KEY,
    last_synced_at  INTEGER     NOT NULL
);

-- Per device, not synced: which top-level decks of a profile the user chose to import, or chose not to.
CREATE TABLE anki_deck_choices(
    profile         TEXT        NOT NULL,
    deck            TEXT        NOT NULL,
    import          INTEGER     NOT NULL,
    PRIMARY KEY (profile, deck)
);

-- Per device, not synced: the cards a profile held at its last sync, so one missing now was deleted in Anki.
CREATE TABLE anki_paired_cards(
    profile         TEXT        NOT NULL,
    anki_card_id    INTEGER     NOT NULL,
    card_id         TEXT        NOT NULL,
    -- Both apps' due day at the last sync, to tell which moved it: Amber's local date, Anki's day number.
    -- NULL where the card wasn't due by the day.
    amber_due       TEXT,
    anki_due        INTEGER,
    PRIMARY KEY (profile, anki_card_id)
);

-- Per device, not synced: cards the importer left out (blank ones, new clozes of a known occlusion), so they
-- don't count as new on every sync.
CREATE TABLE anki_skipped_cards(
    profile         TEXT        NOT NULL,
    anki_card_id    INTEGER     NOT NULL,
    PRIMARY KEY (profile, anki_card_id)
);

-- When the card's front or back was last saved, which the Anki sync compares with an edit made in Anki;
-- NULL until the first edit after creation.
ALTER TABLE cards ADD COLUMN content_modified_at TEXT;

-- Not while a cloud sync applies remote rows, which bring the time of the edit on their own device.
CREATE TRIGGER cards_update_content_modified_at_after_update
    AFTER UPDATE OF front, back ON cards
    WHEN NOT EXISTS (SELECT 1 FROM sync_applying)
        AND (NEW.front IS NOT OLD.front OR NEW.back IS NOT OLD.back)
BEGIN
    UPDATE cards
    SET content_modified_at = datetime('now')
    WHERE id = NEW.id;
END;

-- When the card's due date was last moved without a review, which the Anki sync compares with Anki's reviews
-- and reschedules; NULL until the first such move.
ALTER TABLE card_reviews ADD COLUMN due_moved_at TEXT;

-- Not while a cloud sync applies remote rows, which bring the time of the move on their own device.
CREATE TRIGGER card_reviews_update_due_moved_at_after_update
    AFTER UPDATE OF due ON card_reviews
    WHEN NOT EXISTS (SELECT 1 FROM sync_applying)
        AND NEW.due IS NOT OLD.due
        AND NEW.last_reviewed IS OLD.last_reviewed
BEGIN
    UPDATE card_reviews
    SET due_moved_at = datetime('now')
    WHERE card_id = NEW.card_id;
END;

-- The full name of the Anki deck the importer made the folder from (`Spanish::Verbs`), NULL for a folder made
-- in Amber. The Anki sync keeps such a folder's cards in that deck wherever it's moved, and puts folders made
-- in Amber under an `Amber` deck.
ALTER TABLE folders ADD COLUMN anki_deck TEXT;
