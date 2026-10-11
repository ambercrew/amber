-- Content-addressed, immutable images: `id` is the SHA-256 hex of `data`, shared across devices.
-- `data` is last so metadata reads never page the blob in.
CREATE TABLE assets(
    id          TEXT        NOT NULL        PRIMARY KEY,
    mime_type   TEXT        NOT NULL,
    byte_size   INTEGER     NOT NULL,
    created_at  TEXT        NOT NULL        DEFAULT (datetime('now')),
    data        BLOB        NOT NULL
);

-------------------------------------------------------------------------

-- Local-only (never synced) asset references, derived from content by the triggers
-- below; `part` is a split's `seq` (0 otherwise), so a split refreshes only its own rows.
CREATE TABLE element_assets(
    element_id  TEXT        NOT NULL,
    part        INTEGER     NOT NULL,
    asset_id    TEXT        NOT NULL,
    PRIMARY KEY (element_id, part, asset_id)
);

CREATE INDEX element_assets_asset_id_index ON element_assets(asset_id);

-- Local-only GC bookkeeping: when a sweep first saw an asset unreferenced.
CREATE TABLE asset_gc(
    asset_id            TEXT    NOT NULL    PRIMARY KEY,
    unreferenced_since  TEXT    NOT NULL
);

-- Local-only: when this device last stored or reused an asset, so a remote sweep
-- can't delete it before the content referencing it is saved.
CREATE TABLE asset_claims(
    asset_id    TEXT    NOT NULL    PRIMARY KEY,
    claimed_at  TEXT    NOT NULL
);

CREATE TRIGGER assets_clear_bookkeeping_after_delete
    AFTER DELETE ON assets
BEGIN
    DELETE FROM asset_gc WHERE asset_id = OLD.id;
    DELETE FROM asset_claims WHERE asset_id = OLD.id;
END;

-------------------------------------------------------------------------

-- Each trigger parses only the written document, and only if it has an `amber-asset:` src.
CREATE TRIGGER extracts_refresh_element_assets_after_insert
    AFTER INSERT ON extracts
BEGIN
    INSERT OR IGNORE INTO element_assets(element_id, part, asset_id)
    SELECT NEW.id, 0, substr(j.value, 13)
    FROM json_tree(CASE WHEN NEW.content LIKE '%amber-asset:%' AND json_valid(NEW.content) THEN NEW.content ELSE '{}' END) j
    WHERE j.key = 'src' AND j.type = 'text' AND j.value LIKE 'amber-asset:%';
END;

CREATE TRIGGER extracts_refresh_element_assets_after_update
    AFTER UPDATE OF content ON extracts
BEGIN
    DELETE FROM element_assets WHERE element_id = OLD.id;
    INSERT OR IGNORE INTO element_assets(element_id, part, asset_id)
    SELECT NEW.id, 0, substr(j.value, 13)
    FROM json_tree(CASE WHEN NEW.content LIKE '%amber-asset:%' AND json_valid(NEW.content) THEN NEW.content ELSE '{}' END) j
    WHERE j.key = 'src' AND j.type = 'text' AND j.value LIKE 'amber-asset:%';
END;

CREATE TRIGGER extracts_clear_element_assets_after_delete
    AFTER DELETE ON extracts
BEGIN
    DELETE FROM element_assets WHERE element_id = OLD.id;
END;

CREATE TRIGGER cards_refresh_element_assets_after_insert
    AFTER INSERT ON cards
BEGIN
    INSERT OR IGNORE INTO element_assets(element_id, part, asset_id)
    SELECT NEW.id, 0, substr(j.value, 13)
    FROM json_tree(CASE WHEN NEW.front LIKE '%amber-asset:%' AND json_valid(NEW.front) THEN NEW.front ELSE '{}' END) j
    WHERE j.key = 'src' AND j.type = 'text' AND j.value LIKE 'amber-asset:%'
    UNION
    SELECT NEW.id, 0, substr(j.value, 13)
    FROM json_tree(CASE WHEN NEW.back LIKE '%amber-asset:%' AND json_valid(NEW.back) THEN NEW.back ELSE '{}' END) j
    WHERE j.key = 'src' AND j.type = 'text' AND j.value LIKE 'amber-asset:%';
END;

CREATE TRIGGER cards_refresh_element_assets_after_update
    AFTER UPDATE OF front, back ON cards
BEGIN
    DELETE FROM element_assets WHERE element_id = OLD.id;
    INSERT OR IGNORE INTO element_assets(element_id, part, asset_id)
    SELECT NEW.id, 0, substr(j.value, 13)
    FROM json_tree(CASE WHEN NEW.front LIKE '%amber-asset:%' AND json_valid(NEW.front) THEN NEW.front ELSE '{}' END) j
    WHERE j.key = 'src' AND j.type = 'text' AND j.value LIKE 'amber-asset:%'
    UNION
    SELECT NEW.id, 0, substr(j.value, 13)
    FROM json_tree(CASE WHEN NEW.back LIKE '%amber-asset:%' AND json_valid(NEW.back) THEN NEW.back ELSE '{}' END) j
    WHERE j.key = 'src' AND j.type = 'text' AND j.value LIKE 'amber-asset:%';
END;

CREATE TRIGGER cards_clear_element_assets_after_delete
    AFTER DELETE ON cards
BEGIN
    DELETE FROM element_assets WHERE element_id = OLD.id;
END;

CREATE TRIGGER learning_asset_splits_refresh_element_assets_after_insert
    AFTER INSERT ON learning_asset_splits
BEGIN
    INSERT OR IGNORE INTO element_assets(element_id, part, asset_id)
    SELECT NEW.learning_asset_id, NEW.seq, substr(j.value, 13)
    FROM json_tree(CASE WHEN NEW.content LIKE '%amber-asset:%' AND json_valid(NEW.content) THEN NEW.content ELSE '{}' END) j
    WHERE j.key = 'src' AND j.type = 'text' AND j.value LIKE 'amber-asset:%';
END;

CREATE TRIGGER learning_asset_splits_refresh_element_assets_after_update
    AFTER UPDATE OF content ON learning_asset_splits
BEGIN
    DELETE FROM element_assets WHERE element_id = OLD.learning_asset_id AND part = OLD.seq;
    INSERT OR IGNORE INTO element_assets(element_id, part, asset_id)
    SELECT NEW.learning_asset_id, NEW.seq, substr(j.value, 13)
    FROM json_tree(CASE WHEN NEW.content LIKE '%amber-asset:%' AND json_valid(NEW.content) THEN NEW.content ELSE '{}' END) j
    WHERE j.key = 'src' AND j.type = 'text' AND j.value LIKE 'amber-asset:%';
END;

CREATE TRIGGER learning_asset_splits_clear_element_assets_after_delete
    AFTER DELETE ON learning_asset_splits
BEGIN
    DELETE FROM element_assets WHERE element_id = OLD.learning_asset_id AND part = OLD.seq;
END;

-------------------------------------------------------------------------

-- Per-table condition under which a remote delete is refused and the row re-staged
-- (see `apply`); rewritten on every startup from `table_configs()`.
CREATE TABLE IF NOT EXISTS sync_delete_guards (
    tbl         TEXT NOT NULL PRIMARY KEY,
    condition   TEXT NOT NULL
) WITHOUT ROWID;

-------------------------------------------------------------------------

-- How a saved search orders its results; NULL for searches saved before
-- sorting existed, which fall back to the Browser's default sort.
ALTER TABLE saved_searches ADD COLUMN sort_column TEXT;
ALTER TABLE saved_searches ADD COLUMN sort_direction TEXT;

DROP TRIGGER saved_searches_update_modified_at_after_update;

CREATE TRIGGER saved_searches_update_modified_at_after_update
    AFTER UPDATE OF name, sort_column, sort_direction ON saved_searches
BEGIN
    UPDATE saved_searches
    SET modified_at = datetime('now')
    WHERE id = NEW.id;
END;

-------------------------------------------------------------------------

-- One image plus its masks, shared by every card generated from it. The image is
-- referenced by asset id rather than embedded.
CREATE TABLE image_occlusions(
    id              TEXT        NOT NULL        PRIMARY KEY,
    created_at      TEXT        NOT NULL        DEFAULT (datetime('now')),
    modified_at     TEXT        NOT NULL        DEFAULT (datetime('now')),
    name            TEXT        NOT NULL,
    image_asset_id  TEXT        NOT NULL,
    image_width     INTEGER     NOT NULL,
    image_height    INTEGER     NOT NULL,
    shapes          TEXT        NOT NULL        DEFAULT '[]',
    mode            TEXT        NOT NULL,
    parent_id       TEXT,
    FOREIGN KEY (parent_id) REFERENCES meta(element_id) ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TRIGGER image_occlusions_update_modified_at_after_update
    AFTER UPDATE OF name, image_asset_id, image_width, image_height, shapes, mode ON image_occlusions
BEGIN
    UPDATE image_occlusions
    SET modified_at = datetime('now')
    WHERE id = NEW.id;
END;

-- The image is a reference like any element's, so asset GC keeps it while the occlusion exists.
CREATE TRIGGER image_occlusions_add_element_asset_after_insert
    AFTER INSERT ON image_occlusions
BEGIN
    INSERT OR IGNORE INTO element_assets(element_id, part, asset_id)
    VALUES (NEW.id, 0, NEW.image_asset_id);
END;

CREATE TRIGGER image_occlusions_clear_element_assets_after_delete
    AFTER DELETE ON image_occlusions
BEGIN
    DELETE FROM element_assets WHERE element_id = OLD.id;
END;

-------------------------------------------------------------------------

-- Links a card to the occlusion target (a mask, or a group of masks) it quizzes.
CREATE TABLE image_occlusion_cards(
    card_id         TEXT        NOT NULL        PRIMARY KEY,
    occlusion_id    TEXT        NOT NULL,
    target_key      TEXT        NOT NULL,
    FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY (occlusion_id) REFERENCES image_occlusions(id) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX image_occlusion_cards_occlusion_id_index ON image_occlusion_cards(occlusion_id);

CREATE INDEX image_occlusions_parent_id_index ON image_occlusions(parent_id);

-- An occlusion lives as long as its cards, so deleting the last one frees its image for asset GC.
-- Skipped during remote apply: the deleting device syncs the occlusion's own tombstone.
CREATE TRIGGER image_occlusion_cards_delete_orphaned_occlusion_after_delete
    AFTER DELETE ON image_occlusion_cards
    WHEN NOT EXISTS (SELECT 1 FROM sync_applying)
        AND NOT EXISTS (SELECT 1 FROM image_occlusion_cards WHERE occlusion_id = OLD.occlusion_id)
BEGIN
    DELETE FROM image_occlusions WHERE id = OLD.occlusion_id;
END;
