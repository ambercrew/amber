-- 'manual' or 'automatic' (`NameSource`): an automatic name follows the element's content until the user renames it.
-- Existing elements keep their names.
ALTER TABLE meta ADD COLUMN name_source TEXT NOT NULL DEFAULT 'manual' CHECK (name_source IN ('manual', 'automatic'));
