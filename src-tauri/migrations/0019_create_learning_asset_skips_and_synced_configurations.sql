-- When each learning asset was last skipped in a study session (Unix ms), so every device puts today's skips last.
-- Rewritten on each skip and never pruned, as a delete would leave a sync tombstone about as large as the row.
CREATE TABLE learning_asset_skips(
    element_id                  TEXT        NOT NULL        PRIMARY KEY,
    skipped_at                  INTEGER     NOT NULL,
    FOREIGN KEY (element_id) REFERENCES meta(element_id) ON DELETE CASCADE ON UPDATE CASCADE
) WITHOUT ROWID;

-- Preferences shared by every device, as JSON by name; per-machine ones stay in `local_configurations`.
CREATE TABLE synced_configurations(
    name                        TEXT        NOT NULL        PRIMARY KEY,
    value                       TEXT        NOT NULL
) WITHOUT ROWID;

INSERT INTO synced_configurations(name, value)
SELECT name, value FROM local_configurations WHERE name = 'FUZZ_FACTOR';
DELETE FROM local_configurations WHERE name = 'FUZZ_FACTOR';
