ALTER TABLE learning_assets ADD COLUMN type TEXT NOT NULL DEFAULT 'extracted';

CREATE TABLE learning_asset_pdfs (
    learning_asset_id TEXT NOT NULL PRIMARY KEY REFERENCES learning_assets (id) ON DELETE CASCADE,
    bytes BLOB NOT NULL,
    page_count INTEGER NOT NULL
);
