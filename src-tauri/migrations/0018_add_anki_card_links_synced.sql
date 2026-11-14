-- Whether an Anki sync has paired the card, so every device knows its content is replaced when the note changes in Anki.
-- Unlike `anki_paired_cards`, which is per device. Not backfilled: only the next sync's update gets staged for other devices.
ALTER TABLE anki_card_links ADD COLUMN synced INTEGER NOT NULL DEFAULT 0;

-- When the card was last reset to new in Amber, which the Anki sync compares with Anki's log to forget the card
-- there too; NULL until the first reset. Written by the reset itself, so cloud sync's applies keep its device's time.
ALTER TABLE card_reviews ADD COLUMN reset_at TEXT;

-- The text of files uploaded to an AI chat, which its `search_documents` tool searches; kept on this device only.
-- One row per PDF page, or per file otherwise; `page` is the 1-based PDF page, NULL for other files.
CREATE TABLE ai_documents(
    id                          TEXT        NOT NULL        PRIMARY KEY,
    ai_chat_id                  TEXT        NOT NULL,
    file_name                   TEXT        NOT NULL,
    position                    INTEGER     NOT NULL,
    page                        INTEGER,
    content                     TEXT        NOT NULL,
    FOREIGN KEY (ai_chat_id) REFERENCES ai_chats(id) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX ai_documents_ai_chat_id_index ON ai_documents(ai_chat_id);
