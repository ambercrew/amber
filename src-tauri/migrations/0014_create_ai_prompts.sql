-- The user's reusable AI chat prompts, inserted by typing `/` in the chat input.
CREATE TABLE ai_prompts(
    id                          TEXT        NOT NULL        PRIMARY KEY,
    created_at                  TEXT        NOT NULL        DEFAULT (datetime('now')),
    modified_at                 TEXT        NOT NULL        DEFAULT (datetime('now')),
    name                        TEXT        NOT NULL,
    content                     TEXT        NOT NULL
);

CREATE TRIGGER ai_prompts_update_modified_at_after_update
    AFTER UPDATE OF name, content ON ai_prompts
BEGIN
    UPDATE ai_prompts
    SET modified_at = datetime('now')
    WHERE id = NEW.id;
END;
