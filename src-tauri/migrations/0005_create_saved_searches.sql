CREATE TABLE saved_searches(
    id                          TEXT        NOT NULL        PRIMARY KEY,
    created_at                  TEXT        NOT NULL        DEFAULT (datetime('now')),
    modified_at                 TEXT        NOT NULL        DEFAULT (datetime('now')),
    name                        TEXT        NOT NULL
);

CREATE TRIGGER saved_searches_update_modified_at_after_update
    AFTER UPDATE OF name ON saved_searches
BEGIN
    UPDATE saved_searches
    SET modified_at = datetime('now')
    WHERE id = NEW.id;
END;

CREATE TRIGGER saved_searches_add_to_deleted_entities_after_delete
    AFTER DELETE ON saved_searches
BEGIN
    INSERT INTO deleted_entities (entity_name, entity_id, entity_created_at, deleted_date)
    VALUES ('saved_searches', OLD.id, OLD.created_at, datetime('now'));
END;

-------------------------------------------------------------------------

CREATE TABLE saved_search_filters(
    id                          TEXT        NOT NULL        PRIMARY KEY,
    created_at                  TEXT        NOT NULL        DEFAULT (datetime('now')),
    modified_at                 TEXT        NOT NULL        DEFAULT (datetime('now')),
    saved_search_id             TEXT        NOT NULL,
    position                    INTEGER     NOT NULL,
    filter                      TEXT        NOT NULL,
    FOREIGN KEY (saved_search_id) REFERENCES saved_searches(id) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX saved_search_filters_saved_search_id_index ON saved_search_filters(saved_search_id);

CREATE TRIGGER saved_search_filters_update_modified_at_after_update
    AFTER UPDATE OF position, filter ON saved_search_filters
BEGIN
    UPDATE saved_search_filters
    SET modified_at = datetime('now')
    WHERE id = NEW.id;
END;

CREATE TRIGGER saved_search_filters_add_to_deleted_entities_after_delete
    AFTER DELETE ON saved_search_filters
BEGIN
    INSERT INTO deleted_entities (entity_name, entity_id, entity_created_at, deleted_date)
    VALUES ('saved_search_filters', OLD.id, OLD.created_at, datetime('now'));
END;
