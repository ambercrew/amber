-- Where newly created elements land in the priority queue, relative to the
-- element they were derived from. A NULL placement means "above parent", the
-- behaviour every existing profile had.
ALTER TABLE study_profiles ADD COLUMN priority_inheritance_placement TEXT;

-- The percentile the placement takes (an offset or an absolute spot); NULL for
-- the placements that take none.
ALTER TABLE study_profiles ADD COLUMN priority_inheritance_percentile REAL;

-- NULL means the placement is uncapped.
ALTER TABLE study_profiles ADD COLUMN priority_inheritance_ceiling_percentile REAL;

DROP TRIGGER study_profiles_update_modified_at_after_update;

CREATE TRIGGER study_profiles_update_modified_at_after_update
    AFTER UPDATE OF name, is_default, desired_retention, fsrs_params, learning_steps, relearning_steps, initial_interval_multiplier, initial_interval_days, min_interval_days, priority_inheritance_placement, priority_inheritance_percentile, priority_inheritance_ceiling_percentile ON study_profiles
BEGIN
    UPDATE study_profiles
    SET modified_at = datetime('now')
    WHERE id = NEW.id;
END;
