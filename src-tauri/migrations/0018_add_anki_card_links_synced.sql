-- Whether an Anki sync has paired the card, so every device knows its content is replaced when the note changes in Anki.
-- Unlike `anki_paired_cards`, which is per device. Not backfilled: only the next sync's update gets staged for other devices.
ALTER TABLE anki_card_links ADD COLUMN synced INTEGER NOT NULL DEFAULT 0;
