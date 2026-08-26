-- ts-fsrs tracks two scheduling fields Amber's card_reviews table lacked:
-- `scheduled_days` (the interval the card was last scheduled for) and
-- `learning_steps` (how far the card has advanced through its profile's
-- learning/relearning steps). Without the latter a card can never progress
-- through the steps, so every rating fell back to a long-term interval.
ALTER TABLE card_reviews ADD COLUMN scheduled_days INTEGER NOT NULL DEFAULT 0;
ALTER TABLE card_reviews ADD COLUMN learning_steps INTEGER NOT NULL DEFAULT 0;
