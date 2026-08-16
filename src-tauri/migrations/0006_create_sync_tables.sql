CREATE TABLE IF NOT EXISTS sync_cells (
    tbl TEXT NOT NULL,
    row_id TEXT NOT NULL,
    col TEXT NOT NULL,
    value BLOB,
    hlc TEXT NOT NULL,
    device_id TEXT NOT NULL,
    PRIMARY KEY (tbl, row_id, col)
) WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS sync_registry (
    tbl TEXT PRIMARY KEY,
    granularity TEXT NOT NULL
) WITHOUT ROWID;

CREATE INDEX IF NOT EXISTS idx_sync_cells_device_hlc ON sync_cells(device_id, hlc);

-- Guards `apply_remote` against re-triggering local change tracking while it
-- mirrors a remote change into a base table. This must be a regular (not TEMP)
-- table: SQLite trigger bodies resolve unqualified names only against the
-- schema that owns the triggering table (`main`), never falling back to `temp`
-- the way top-level queries do — and `temp.sync_applying` is itself rejected at
-- `CREATE TRIGGER` time ("trigger ... cannot reference objects in database
-- temp"). So a TEMP guard table is unreachable from inside a trigger either way.
CREATE TABLE IF NOT EXISTS sync_applying (x);

-- `deleted_entities` was a manually-maintained tombstone log for offline-first
-- sync; sync_cells' HLC-tracked tombstones (see merge::DELETED_COL) now serve
-- that purpose, so the table, its indexes, and every trigger that fed it are
-- no longer needed.
DROP TRIGGER IF EXISTS tags_remove_from_deleted_entities_after_insert;
DROP TRIGGER IF EXISTS tags_add_to_deleted_entities_after_delete;
DROP TRIGGER IF EXISTS tag_parents_remove_from_deleted_entities_after_insert;
DROP TRIGGER IF EXISTS tag_parents_add_to_deleted_entities_after_delete;
DROP TRIGGER IF EXISTS study_profiles_add_to_deleted_entities_after_delete;
DROP TRIGGER IF EXISTS bibliographical_sources_add_to_deleted_entities_after_delete;
DROP TRIGGER IF EXISTS element_tags_remove_from_deleted_entities_after_insert;
DROP TRIGGER IF EXISTS element_tags_add_to_deleted_entities_after_delete;
DROP TRIGGER IF EXISTS folders_add_to_deleted_entities_after_delete;
DROP TRIGGER IF EXISTS readings_add_to_deleted_entities_after_delete;
DROP TRIGGER IF EXISTS learning_assets_add_to_deleted_entities_after_delete;
DROP TRIGGER IF EXISTS extracts_add_to_deleted_entities_after_delete;
DROP TRIGGER IF EXISTS cards_add_to_deleted_entities_after_delete;
DROP TRIGGER IF EXISTS saved_searches_add_to_deleted_entities_after_delete;
DROP TRIGGER IF EXISTS saved_search_filters_add_to_deleted_entities_after_delete;

DROP INDEX IF EXISTS deleted_entities_entity_id_and_name_index;
DROP INDEX IF EXISTS deleted_entities_deleted_date_index;

DROP TABLE IF EXISTS deleted_entities;
