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

-- The default mirrors DEFAULT_MAXIMUM_INTERVAL_DAYS in study_profile.rs.
ALTER TABLE study_profiles ADD COLUMN maximum_interval_days INTEGER NOT NULL DEFAULT 36500;

DROP TRIGGER study_profiles_update_modified_at_after_update;

CREATE TRIGGER study_profiles_update_modified_at_after_update
    AFTER UPDATE OF name, is_default, desired_retention, fsrs_params, learning_steps, relearning_steps, maximum_interval_days, initial_interval_multiplier, initial_interval_days, min_interval_days, priority_inheritance_placement, priority_inheritance_percentile, priority_inheritance_ceiling_percentile ON study_profiles
BEGIN
    UPDATE study_profiles
    SET modified_at = datetime('now')
    WHERE id = NEW.id;
END;
