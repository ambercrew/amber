-- Pulled cells waiting to be applied, so each pulled page commits with the cursor and a restart resumes.
-- Local to this device, never registered for sync.
CREATE TABLE sync_inbox (
    seq         INTEGER     PRIMARY KEY,
    tbl         TEXT        NOT NULL,
    row_id      TEXT        NOT NULL,
    col         TEXT        NOT NULL,
    value       BLOB,
    hlc         TEXT        NOT NULL,
    device_id   TEXT        NOT NULL
);

-- Lets startup seed the HLC clock past staged cells with a seek.
CREATE INDEX idx_sync_inbox_hlc ON sync_inbox(hlc);

-- Lets an apply batch take every staged cell of the rows it applies with a seek.
CREATE INDEX idx_sync_inbox_row_id ON sync_inbox(row_id);

-- Slims the cell log down to metadata: a cell's value is read from its row when pushed, so only cells of a
-- row not in its table yet keep theirs, in `sync_pending_cells`. HLCs shrink to 28 bytes (`Hlc::to_bytes`).

-- The sync triggers write the old columns; `register_table` recreates them at startup.
DROP TRIGGER IF EXISTS sync_ai_chats_ai; DROP TRIGGER IF EXISTS sync_ai_chats_au; DROP TRIGGER IF EXISTS sync_ai_chats_ad;
DROP TRIGGER IF EXISTS sync_ai_message_context_snippets_ai; DROP TRIGGER IF EXISTS sync_ai_message_context_snippets_au; DROP TRIGGER IF EXISTS sync_ai_message_context_snippets_ad;
DROP TRIGGER IF EXISTS sync_ai_messages_ai; DROP TRIGGER IF EXISTS sync_ai_messages_au; DROP TRIGGER IF EXISTS sync_ai_messages_ad;
DROP TRIGGER IF EXISTS sync_ai_prompts_ai; DROP TRIGGER IF EXISTS sync_ai_prompts_au; DROP TRIGGER IF EXISTS sync_ai_prompts_ad;
DROP TRIGGER IF EXISTS sync_anki_answered_reviews_ai; DROP TRIGGER IF EXISTS sync_anki_answered_reviews_au; DROP TRIGGER IF EXISTS sync_anki_answered_reviews_ad;
DROP TRIGGER IF EXISTS sync_anki_card_links_ai; DROP TRIGGER IF EXISTS sync_anki_card_links_au; DROP TRIGGER IF EXISTS sync_anki_card_links_ad;
DROP TRIGGER IF EXISTS sync_assets_ai; DROP TRIGGER IF EXISTS sync_assets_au; DROP TRIGGER IF EXISTS sync_assets_ad;
DROP TRIGGER IF EXISTS sync_bibliographical_sources_ai; DROP TRIGGER IF EXISTS sync_bibliographical_sources_au; DROP TRIGGER IF EXISTS sync_bibliographical_sources_ad;
DROP TRIGGER IF EXISTS sync_card_review_logs_ai; DROP TRIGGER IF EXISTS sync_card_review_logs_au; DROP TRIGGER IF EXISTS sync_card_review_logs_ad;
DROP TRIGGER IF EXISTS sync_card_reviews_ai; DROP TRIGGER IF EXISTS sync_card_reviews_au; DROP TRIGGER IF EXISTS sync_card_reviews_ad;
DROP TRIGGER IF EXISTS sync_cards_ai; DROP TRIGGER IF EXISTS sync_cards_au; DROP TRIGGER IF EXISTS sync_cards_ad;
DROP TRIGGER IF EXISTS sync_device_schema_versions_ai; DROP TRIGGER IF EXISTS sync_device_schema_versions_au; DROP TRIGGER IF EXISTS sync_device_schema_versions_ad;
DROP TRIGGER IF EXISTS sync_element_tags_ai; DROP TRIGGER IF EXISTS sync_element_tags_au; DROP TRIGGER IF EXISTS sync_element_tags_ad;
DROP TRIGGER IF EXISTS sync_extracts_ai; DROP TRIGGER IF EXISTS sync_extracts_au; DROP TRIGGER IF EXISTS sync_extracts_ad;
DROP TRIGGER IF EXISTS sync_folders_ai; DROP TRIGGER IF EXISTS sync_folders_au; DROP TRIGGER IF EXISTS sync_folders_ad;
DROP TRIGGER IF EXISTS sync_image_occlusion_cards_ai; DROP TRIGGER IF EXISTS sync_image_occlusion_cards_au; DROP TRIGGER IF EXISTS sync_image_occlusion_cards_ad;
DROP TRIGGER IF EXISTS sync_image_occlusions_ai; DROP TRIGGER IF EXISTS sync_image_occlusions_au; DROP TRIGGER IF EXISTS sync_image_occlusions_ad;
DROP TRIGGER IF EXISTS sync_learning_asset_marks_ai; DROP TRIGGER IF EXISTS sync_learning_asset_marks_au; DROP TRIGGER IF EXISTS sync_learning_asset_marks_ad;
DROP TRIGGER IF EXISTS sync_learning_asset_pdf_highlights_ai; DROP TRIGGER IF EXISTS sync_learning_asset_pdf_highlights_au; DROP TRIGGER IF EXISTS sync_learning_asset_pdf_highlights_ad;
DROP TRIGGER IF EXISTS sync_learning_asset_pdfs_ai; DROP TRIGGER IF EXISTS sync_learning_asset_pdfs_au; DROP TRIGGER IF EXISTS sync_learning_asset_pdfs_ad;
DROP TRIGGER IF EXISTS sync_learning_asset_review_logs_ai; DROP TRIGGER IF EXISTS sync_learning_asset_review_logs_au; DROP TRIGGER IF EXISTS sync_learning_asset_review_logs_ad;
DROP TRIGGER IF EXISTS sync_learning_asset_reviews_ai; DROP TRIGGER IF EXISTS sync_learning_asset_reviews_au; DROP TRIGGER IF EXISTS sync_learning_asset_reviews_ad;
DROP TRIGGER IF EXISTS sync_learning_asset_skips_ai; DROP TRIGGER IF EXISTS sync_learning_asset_skips_au; DROP TRIGGER IF EXISTS sync_learning_asset_skips_ad;
DROP TRIGGER IF EXISTS sync_learning_asset_splits_ai; DROP TRIGGER IF EXISTS sync_learning_asset_splits_au; DROP TRIGGER IF EXISTS sync_learning_asset_splits_ad;
DROP TRIGGER IF EXISTS sync_learning_assets_ai; DROP TRIGGER IF EXISTS sync_learning_assets_au; DROP TRIGGER IF EXISTS sync_learning_assets_ad;
DROP TRIGGER IF EXISTS sync_meta_ai; DROP TRIGGER IF EXISTS sync_meta_au; DROP TRIGGER IF EXISTS sync_meta_ad;
DROP TRIGGER IF EXISTS sync_saved_search_filters_ai; DROP TRIGGER IF EXISTS sync_saved_search_filters_au; DROP TRIGGER IF EXISTS sync_saved_search_filters_ad;
DROP TRIGGER IF EXISTS sync_saved_searches_ai; DROP TRIGGER IF EXISTS sync_saved_searches_au; DROP TRIGGER IF EXISTS sync_saved_searches_ad;
DROP TRIGGER IF EXISTS sync_study_profiles_ai; DROP TRIGGER IF EXISTS sync_study_profiles_au; DROP TRIGGER IF EXISTS sync_study_profiles_ad;
DROP TRIGGER IF EXISTS sync_synced_configurations_ai; DROP TRIGGER IF EXISTS sync_synced_configurations_au; DROP TRIGGER IF EXISTS sync_synced_configurations_ad;
DROP TRIGGER IF EXISTS sync_tag_parents_ai; DROP TRIGGER IF EXISTS sync_tag_parents_au; DROP TRIGGER IF EXISTS sync_tag_parents_ad;
DROP TRIGGER IF EXISTS sync_tags_ai; DROP TRIGGER IF EXISTS sync_tags_au; DROP TRIGGER IF EXISTS sync_tags_ad;

-- Column-mode cells whose row hasn't been written yet: row mode always writes its row whole.
CREATE TABLE sync_pending_cells (
    tbl         TEXT        NOT NULL,
    row_id      TEXT        NOT NULL,
    col         TEXT        NOT NULL,
    value       BLOB,
    PRIMARY KEY (tbl, row_id, col)
) WITHOUT ROWID;

INSERT INTO sync_pending_cells(tbl, row_id, col, value)
SELECT tbl, row_id, col, value FROM sync_cells AS cell
WHERE col <> '__deleted' AND CASE tbl
    WHEN 'meta' THEN NOT EXISTS (SELECT 1 FROM meta WHERE element_id = cell.row_id ->> 0)
    WHEN 'assets' THEN NOT EXISTS (SELECT 1 FROM assets WHERE id = cell.row_id ->> 0)
    WHEN 'learning_asset_pdfs' THEN NOT EXISTS (
        SELECT 1 FROM learning_asset_pdfs WHERE learning_asset_id = cell.row_id ->> 0)
    WHEN 'learning_asset_pdf_highlights' THEN NOT EXISTS (
        SELECT 1 FROM learning_asset_pdf_highlights WHERE learning_asset_id = cell.row_id ->> 0)
    WHEN 'learning_asset_skips' THEN NOT EXISTS (
        SELECT 1 FROM learning_asset_skips WHERE element_id = cell.row_id ->> 0)
    ELSE 0
END;

-- `is_remote` replaces the device id, which the HLC already holds, for the push's and clock seed's seeks.
CREATE TABLE sync_cells_compact (
    tbl         TEXT        NOT NULL,
    row_id      TEXT        NOT NULL,
    col         TEXT        NOT NULL,
    hlc         BLOB        NOT NULL,
    is_remote   INTEGER     NOT NULL,
    PRIMARY KEY (tbl, row_id, col)
) WITHOUT ROWID;

INSERT INTO sync_cells_compact(tbl, row_id, col, hlc, is_remote)
SELECT
    tbl,
    row_id,
    col,
    unhex(printf('%016X', CAST(substr(hlc, 1, 15) AS INTEGER)) || substr(hlc, 17, 8)
        || replace(substr(hlc, 26), '-', '')),
    device_id IS NOT (SELECT value FROM local_configurations WHERE name = 'sync_device_id')
FROM sync_cells;

DROP TABLE sync_cells;
ALTER TABLE sync_cells_compact RENAME TO sync_cells;

CREATE INDEX idx_sync_cells_is_remote_hlc ON sync_cells(is_remote, hlc);

-- An apply writes the synced `modified_at` itself, and a value set meanwhile would be pushed under a local cell's HLC.
DROP TRIGGER ai_prompts_update_modified_at_after_update;
CREATE TRIGGER ai_prompts_update_modified_at_after_update
    AFTER UPDATE OF name, content ON ai_prompts
    WHEN NOT EXISTS (SELECT 1 FROM sync_applying)
BEGIN
    UPDATE ai_prompts
    SET modified_at = datetime('now')
    WHERE id = NEW.id;
END;

DROP TRIGGER bibliographical_sources_update_modified_at_after_update;
CREATE TRIGGER bibliographical_sources_update_modified_at_after_update
    AFTER UPDATE OF title, authors, publication_date, type, location ON bibliographical_sources
    WHEN NOT EXISTS (SELECT 1 FROM sync_applying)
BEGIN
    UPDATE bibliographical_sources
    SET modified_at = datetime('now')
    WHERE id = NEW.id;
END;

DROP TRIGGER card_reviews_update_meta_modified_at_after_update;
CREATE TRIGGER card_reviews_update_meta_modified_at_after_update
    AFTER UPDATE ON card_reviews
    WHEN NOT EXISTS (SELECT 1 FROM sync_applying)
BEGIN
    UPDATE meta
    SET modified_at = datetime('now')
    WHERE element_id = NEW.card_id;
END;

DROP TRIGGER element_tags_update_modified_at_after_update;
CREATE TRIGGER element_tags_update_modified_at_after_update
    AFTER UPDATE OF sort_index ON element_tags
    WHEN NOT EXISTS (SELECT 1 FROM sync_applying)
BEGIN
    UPDATE element_tags
    SET modified_at = datetime('now')
    WHERE element_id = NEW.element_id AND tag_id = NEW.tag_id;
END;

DROP TRIGGER image_occlusions_update_modified_at_after_update;
CREATE TRIGGER image_occlusions_update_modified_at_after_update
    AFTER UPDATE OF name, image_asset_id, image_width, image_height, shapes, mode ON image_occlusions
    WHEN NOT EXISTS (SELECT 1 FROM sync_applying)
BEGIN
    UPDATE image_occlusions
    SET modified_at = datetime('now')
    WHERE id = NEW.id;
END;

DROP TRIGGER learning_asset_reviews_update_meta_modified_at_after_update;
CREATE TRIGGER learning_asset_reviews_update_meta_modified_at_after_update
    AFTER UPDATE ON learning_asset_reviews
    WHEN NOT EXISTS (SELECT 1 FROM sync_applying)
BEGIN
    UPDATE meta
    SET modified_at = datetime('now')
    WHERE element_id = NEW.element_id;
END;

DROP TRIGGER meta_update_modified_at_after_update;
CREATE TRIGGER meta_update_modified_at_after_update
    AFTER UPDATE OF name, position, priority, parent_id, parent_type, derived_from_type, derived_from_id, study_profile_id, bibliographical_source_id ON meta
    WHEN NOT EXISTS (SELECT 1 FROM sync_applying)
BEGIN
    UPDATE meta
    SET modified_at = datetime('now')
    WHERE element_id = NEW.element_id;
END;

DROP TRIGGER saved_search_filters_update_modified_at_after_update;
CREATE TRIGGER saved_search_filters_update_modified_at_after_update
    AFTER UPDATE OF position, filter ON saved_search_filters
    WHEN NOT EXISTS (SELECT 1 FROM sync_applying)
BEGIN
    UPDATE saved_search_filters
    SET modified_at = datetime('now')
    WHERE id = NEW.id;
END;

DROP TRIGGER saved_searches_update_modified_at_after_update;
CREATE TRIGGER saved_searches_update_modified_at_after_update
    AFTER UPDATE OF name, sort_column, sort_direction ON saved_searches
    WHEN NOT EXISTS (SELECT 1 FROM sync_applying)
BEGIN
    UPDATE saved_searches
    SET modified_at = datetime('now')
    WHERE id = NEW.id;
END;

DROP TRIGGER study_profiles_update_modified_at_after_update;
CREATE TRIGGER study_profiles_update_modified_at_after_update
    AFTER UPDATE OF name, is_default, desired_retention, fsrs_params, learning_steps, relearning_steps, maximum_interval_days, new_cards_per_day, leech_threshold, leech_action, card_initial_interval_days, bury_new_siblings, bury_review_siblings, initial_interval_multiplier, initial_interval_days, min_interval_days, priority_inheritance_placement, priority_inheritance_percentile, priority_inheritance_ceiling_percentile ON study_profiles
    WHEN NOT EXISTS (SELECT 1 FROM sync_applying)
BEGIN
    UPDATE study_profiles
    SET modified_at = datetime('now')
    WHERE id = NEW.id;
END;

DROP TRIGGER tag_parents_update_modified_at_after_update;
CREATE TRIGGER tag_parents_update_modified_at_after_update
    AFTER UPDATE OF sort_index ON tag_parents
    WHEN NOT EXISTS (SELECT 1 FROM sync_applying)
BEGIN
    UPDATE tag_parents
    SET modified_at = datetime('now')
    WHERE tag_id = NEW.tag_id AND parent_tag_id = NEW.parent_tag_id;
END;

DROP TRIGGER tags_update_modified_at_after_update;
CREATE TRIGGER tags_update_modified_at_after_update
    AFTER UPDATE OF name ON tags
    WHEN NOT EXISTS (SELECT 1 FROM sync_applying)
BEGIN
    UPDATE tags
    SET modified_at = datetime('now')
    WHERE name = NEW.name;
END;
