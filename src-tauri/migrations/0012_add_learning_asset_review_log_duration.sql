-- Time spent reading before pressing Next or Finish, so study time covers
-- reading as well as card reviews. NULL for older logs and bulk actions.
ALTER TABLE learning_asset_review_logs ADD COLUMN duration_ms INTEGER;
