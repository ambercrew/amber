-- Whether an Anki sync has paired the card, so every device knows its content is replaced when the note changes in Anki.
-- Unlike `anki_paired_cards`, which is per device. Not backfilled: only the next sync's update gets staged for other devices.
ALTER TABLE anki_card_links ADD COLUMN synced INTEGER NOT NULL DEFAULT 0;

-- When the card was last reset to new in Amber, which the Anki sync compares with Anki's log to forget the card
-- there too; NULL until the first reset. Written by the reset itself, so cloud sync's applies keep its device's time.
ALTER TABLE card_reviews ADD COLUMN reset_at TEXT;
