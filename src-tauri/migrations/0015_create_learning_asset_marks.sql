-- Up to three reader-placed positions per learning asset, anchored like its read point.
-- A slot with no row is unset.
CREATE TABLE learning_asset_marks(
    learning_asset_id   TEXT        NOT NULL        REFERENCES learning_assets (id) ON DELETE CASCADE,
    slot                INTEGER     NOT NULL        CHECK (slot BETWEEN 1 AND 3),
    split               INTEGER     NOT NULL,
    block               INTEGER     NOT NULL,
    PRIMARY KEY (learning_asset_id, slot)
);

-- Top-level blocks in each split's Lexical content, so loading a split manifest doesn't parse every split.
ALTER TABLE learning_asset_splits ADD COLUMN block_count INTEGER NOT NULL DEFAULT 0;

-- Each device backfills its own splits, so this isn't staged for sync; the repository keeps it current from then on.
INSERT INTO sync_applying (x) VALUES (1);
UPDATE learning_asset_splits
SET block_count = CASE WHEN json_valid(content) THEN COALESCE(json_array_length(content, '$.root.children'), 0) ELSE 0 END;
DELETE FROM sync_applying;
