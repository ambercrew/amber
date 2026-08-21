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

-- Lets `register_table`'s initial-registration backfill bypass the
-- column-mode `au` trigger's per-column "did this actually change" filter
-- (see `trigger_sql::BACKFILLING_BYPASS`/`backfill_via_trigger`), so a
-- no-op self-assignment `UPDATE` on a pre-existing row still forces the
-- trigger to write a cell for every column, seeding `sync_cells` for local
-- data that existed before the table was ever registered for sync.
CREATE TABLE IF NOT EXISTS sync_backfilling (x);

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

-- sqlx-sqlite's `Encode<Sqlite> for Uuid` always writes a raw 16-byte BLOB,
-- regardless of a column's declared TEXT affinity (SQLite only converts
-- *numeric* input under TEXT affinity, not BLOB input). Every id/fk column
-- below was populated by binding a `uuid::Uuid` directly, so existing rows
-- have SQLite storage class BLOB even though the column is declared TEXT.
-- That silently broke `json_array`/`json_object` in the sync trigger SQL
-- ("JSON cannot hold BLOB values"). The application now binds these columns
-- via `uuid::fmt::Hyphenated` (canonical lowercase hyphenated text), so this
-- backfills existing rows to match; it's a no-op wherever a value is already
-- text (idempotent).
--
-- Deferred so that updating a referenced primary key doesn't trip a FK
-- violation against a child row before that child's own UPDATE below runs.
PRAGMA defer_foreign_keys = ON;

UPDATE meta SET element_id =
    lower(hex(substr(element_id,1,4))) || '-' ||
    lower(hex(substr(element_id,5,2))) || '-' ||
    lower(hex(substr(element_id,7,2))) || '-' ||
    lower(hex(substr(element_id,9,2))) || '-' ||
    lower(hex(substr(element_id,11,6)))
WHERE typeof(element_id) = 'blob';

UPDATE meta SET parent_id =
    lower(hex(substr(parent_id,1,4))) || '-' ||
    lower(hex(substr(parent_id,5,2))) || '-' ||
    lower(hex(substr(parent_id,7,2))) || '-' ||
    lower(hex(substr(parent_id,9,2))) || '-' ||
    lower(hex(substr(parent_id,11,6)))
WHERE typeof(parent_id) = 'blob';

UPDATE meta SET derived_from_id =
    lower(hex(substr(derived_from_id,1,4))) || '-' ||
    lower(hex(substr(derived_from_id,5,2))) || '-' ||
    lower(hex(substr(derived_from_id,7,2))) || '-' ||
    lower(hex(substr(derived_from_id,9,2))) || '-' ||
    lower(hex(substr(derived_from_id,11,6)))
WHERE typeof(derived_from_id) = 'blob';

UPDATE meta SET study_profile_id =
    lower(hex(substr(study_profile_id,1,4))) || '-' ||
    lower(hex(substr(study_profile_id,5,2))) || '-' ||
    lower(hex(substr(study_profile_id,7,2))) || '-' ||
    lower(hex(substr(study_profile_id,9,2))) || '-' ||
    lower(hex(substr(study_profile_id,11,6)))
WHERE typeof(study_profile_id) = 'blob';

UPDATE meta SET bibliographical_source_id =
    lower(hex(substr(bibliographical_source_id,1,4))) || '-' ||
    lower(hex(substr(bibliographical_source_id,5,2))) || '-' ||
    lower(hex(substr(bibliographical_source_id,7,2))) || '-' ||
    lower(hex(substr(bibliographical_source_id,9,2))) || '-' ||
    lower(hex(substr(bibliographical_source_id,11,6)))
WHERE typeof(bibliographical_source_id) = 'blob';

UPDATE folders SET id =
    lower(hex(substr(id,1,4))) || '-' ||
    lower(hex(substr(id,5,2))) || '-' ||
    lower(hex(substr(id,7,2))) || '-' ||
    lower(hex(substr(id,9,2))) || '-' ||
    lower(hex(substr(id,11,6)))
WHERE typeof(id) = 'blob';

UPDATE learning_assets SET id =
    lower(hex(substr(id,1,4))) || '-' ||
    lower(hex(substr(id,5,2))) || '-' ||
    lower(hex(substr(id,7,2))) || '-' ||
    lower(hex(substr(id,9,2))) || '-' ||
    lower(hex(substr(id,11,6)))
WHERE typeof(id) = 'blob';

UPDATE learning_asset_splits SET learning_asset_id =
    lower(hex(substr(learning_asset_id,1,4))) || '-' ||
    lower(hex(substr(learning_asset_id,5,2))) || '-' ||
    lower(hex(substr(learning_asset_id,7,2))) || '-' ||
    lower(hex(substr(learning_asset_id,9,2))) || '-' ||
    lower(hex(substr(learning_asset_id,11,6)))
WHERE typeof(learning_asset_id) = 'blob';

UPDATE extracts SET id =
    lower(hex(substr(id,1,4))) || '-' ||
    lower(hex(substr(id,5,2))) || '-' ||
    lower(hex(substr(id,7,2))) || '-' ||
    lower(hex(substr(id,9,2))) || '-' ||
    lower(hex(substr(id,11,6)))
WHERE typeof(id) = 'blob';

UPDATE cards SET id =
    lower(hex(substr(id,1,4))) || '-' ||
    lower(hex(substr(id,5,2))) || '-' ||
    lower(hex(substr(id,7,2))) || '-' ||
    lower(hex(substr(id,9,2))) || '-' ||
    lower(hex(substr(id,11,6)))
WHERE typeof(id) = 'blob';

UPDATE study_profiles SET id =
    lower(hex(substr(id,1,4))) || '-' ||
    lower(hex(substr(id,5,2))) || '-' ||
    lower(hex(substr(id,7,2))) || '-' ||
    lower(hex(substr(id,9,2))) || '-' ||
    lower(hex(substr(id,11,6)))
WHERE typeof(id) = 'blob';

UPDATE bibliographical_sources SET id =
    lower(hex(substr(id,1,4))) || '-' ||
    lower(hex(substr(id,5,2))) || '-' ||
    lower(hex(substr(id,7,2))) || '-' ||
    lower(hex(substr(id,9,2))) || '-' ||
    lower(hex(substr(id,11,6)))
WHERE typeof(id) = 'blob';

UPDATE element_tags SET element_id =
    lower(hex(substr(element_id,1,4))) || '-' ||
    lower(hex(substr(element_id,5,2))) || '-' ||
    lower(hex(substr(element_id,7,2))) || '-' ||
    lower(hex(substr(element_id,9,2))) || '-' ||
    lower(hex(substr(element_id,11,6)))
WHERE typeof(element_id) = 'blob';

UPDATE card_reviews SET card_id =
    lower(hex(substr(card_id,1,4))) || '-' ||
    lower(hex(substr(card_id,5,2))) || '-' ||
    lower(hex(substr(card_id,7,2))) || '-' ||
    lower(hex(substr(card_id,9,2))) || '-' ||
    lower(hex(substr(card_id,11,6)))
WHERE typeof(card_id) = 'blob';

UPDATE learning_asset_reviews SET element_id =
    lower(hex(substr(element_id,1,4))) || '-' ||
    lower(hex(substr(element_id,5,2))) || '-' ||
    lower(hex(substr(element_id,7,2))) || '-' ||
    lower(hex(substr(element_id,9,2))) || '-' ||
    lower(hex(substr(element_id,11,6)))
WHERE typeof(element_id) = 'blob';

UPDATE card_review_logs SET id =
    lower(hex(substr(id,1,4))) || '-' ||
    lower(hex(substr(id,5,2))) || '-' ||
    lower(hex(substr(id,7,2))) || '-' ||
    lower(hex(substr(id,9,2))) || '-' ||
    lower(hex(substr(id,11,6)))
WHERE typeof(id) = 'blob';

UPDATE card_review_logs SET card_id =
    lower(hex(substr(card_id,1,4))) || '-' ||
    lower(hex(substr(card_id,5,2))) || '-' ||
    lower(hex(substr(card_id,7,2))) || '-' ||
    lower(hex(substr(card_id,9,2))) || '-' ||
    lower(hex(substr(card_id,11,6)))
WHERE typeof(card_id) = 'blob';

UPDATE learning_asset_review_logs SET id =
    lower(hex(substr(id,1,4))) || '-' ||
    lower(hex(substr(id,5,2))) || '-' ||
    lower(hex(substr(id,7,2))) || '-' ||
    lower(hex(substr(id,9,2))) || '-' ||
    lower(hex(substr(id,11,6)))
WHERE typeof(id) = 'blob';

UPDATE learning_asset_review_logs SET element_id =
    lower(hex(substr(element_id,1,4))) || '-' ||
    lower(hex(substr(element_id,5,2))) || '-' ||
    lower(hex(substr(element_id,7,2))) || '-' ||
    lower(hex(substr(element_id,9,2))) || '-' ||
    lower(hex(substr(element_id,11,6)))
WHERE typeof(element_id) = 'blob';

UPDATE ai_chats SET id =
    lower(hex(substr(id,1,4))) || '-' ||
    lower(hex(substr(id,5,2))) || '-' ||
    lower(hex(substr(id,7,2))) || '-' ||
    lower(hex(substr(id,9,2))) || '-' ||
    lower(hex(substr(id,11,6)))
WHERE typeof(id) = 'blob';

UPDATE ai_messages SET id =
    lower(hex(substr(id,1,4))) || '-' ||
    lower(hex(substr(id,5,2))) || '-' ||
    lower(hex(substr(id,7,2))) || '-' ||
    lower(hex(substr(id,9,2))) || '-' ||
    lower(hex(substr(id,11,6)))
WHERE typeof(id) = 'blob';

UPDATE ai_messages SET ai_chat_id =
    lower(hex(substr(ai_chat_id,1,4))) || '-' ||
    lower(hex(substr(ai_chat_id,5,2))) || '-' ||
    lower(hex(substr(ai_chat_id,7,2))) || '-' ||
    lower(hex(substr(ai_chat_id,9,2))) || '-' ||
    lower(hex(substr(ai_chat_id,11,6)))
WHERE typeof(ai_chat_id) = 'blob';

UPDATE ai_message_context_snippets SET id =
    lower(hex(substr(id,1,4))) || '-' ||
    lower(hex(substr(id,5,2))) || '-' ||
    lower(hex(substr(id,7,2))) || '-' ||
    lower(hex(substr(id,9,2))) || '-' ||
    lower(hex(substr(id,11,6)))
WHERE typeof(id) = 'blob';

UPDATE ai_message_context_snippets SET ai_message_id =
    lower(hex(substr(ai_message_id,1,4))) || '-' ||
    lower(hex(substr(ai_message_id,5,2))) || '-' ||
    lower(hex(substr(ai_message_id,7,2))) || '-' ||
    lower(hex(substr(ai_message_id,9,2))) || '-' ||
    lower(hex(substr(ai_message_id,11,6)))
WHERE typeof(ai_message_id) = 'blob';

UPDATE saved_searches SET id =
    lower(hex(substr(id,1,4))) || '-' ||
    lower(hex(substr(id,5,2))) || '-' ||
    lower(hex(substr(id,7,2))) || '-' ||
    lower(hex(substr(id,9,2))) || '-' ||
    lower(hex(substr(id,11,6)))
WHERE typeof(id) = 'blob';

UPDATE saved_search_filters SET id =
    lower(hex(substr(id,1,4))) || '-' ||
    lower(hex(substr(id,5,2))) || '-' ||
    lower(hex(substr(id,7,2))) || '-' ||
    lower(hex(substr(id,9,2))) || '-' ||
    lower(hex(substr(id,11,6)))
WHERE typeof(id) = 'blob';

UPDATE saved_search_filters SET saved_search_id =
    lower(hex(substr(saved_search_id,1,4))) || '-' ||
    lower(hex(substr(saved_search_id,5,2))) || '-' ||
    lower(hex(substr(saved_search_id,7,2))) || '-' ||
    lower(hex(substr(saved_search_id,9,2))) || '-' ||
    lower(hex(substr(saved_search_id,11,6)))
WHERE typeof(saved_search_id) = 'blob';

-- Per-synced-table foreign-key repair policies, keyed by (table, column).
-- `register_table` (re)writes these rows on every app start; sync consults
-- them once a full pull has completed to resolve rows whose FK reference is
-- confirmed dangling (see `fk_repair`).
CREATE TABLE IF NOT EXISTS sync_fk_policies (
    tbl           TEXT NOT NULL,
    col           TEXT NOT NULL,
    ref_tbl       TEXT NOT NULL,
    ref_col       TEXT NOT NULL,
    policy        TEXT NOT NULL,
    default_value TEXT,
    PRIMARY KEY (tbl, col)
) WITHOUT ROWID;
