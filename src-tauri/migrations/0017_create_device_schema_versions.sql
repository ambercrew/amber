-- The latest migration each device has applied. A device behind the newest one stops syncing.
CREATE TABLE device_schema_versions(
    device_id TEXT NOT NULL PRIMARY KEY,
    version INTEGER NOT NULL
);
