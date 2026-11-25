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
