-- ts-fsrs supports configurable learning/relearning step lists
-- (FSRSParameters.learning_steps / relearning_steps), but Amber's scheduler
-- never exposed them, so every profile silently used ts-fsrs's hardcoded
-- defaults. Store them per profile, same shape as fsrs_params (nullable
-- JSON-encoded TEXT; NULL means "use ts-fsrs's own defaults").
ALTER TABLE study_profiles ADD COLUMN learning_steps TEXT;
ALTER TABLE study_profiles ADD COLUMN relearning_steps TEXT;

DROP TRIGGER study_profiles_update_modified_at_after_update;

CREATE TRIGGER study_profiles_update_modified_at_after_update
    AFTER UPDATE OF name, is_default, desired_retention, fsrs_params, learning_steps, relearning_steps, initial_interval_multiplier, initial_interval_days, min_interval_days ON study_profiles
BEGIN
    UPDATE study_profiles
    SET modified_at = datetime('now')
    WHERE id = NEW.id;
END;
