use std::ptr::NonNull;

use rusqlite::serialize::OwnedData;
use rusqlite::{Connection, DatabaseName, ffi};

/// Opens a copy of a collection file as an in-memory database.
pub(super) fn open_in_memory(mut bytes: Vec<u8>) -> rusqlite::Result<Connection> {
    if bytes.len() < 100 {
        return Err(rusqlite::Error::SqliteFailure(
            ffi::Error::new(ffi::SQLITE_NOTADB),
            None,
        ));
    }
    // An in-memory database can't use WAL, so a header still marking it would fail to open.
    bytes[18] = 1;
    bytes[19] = 1;

    let mut conn = Connection::open_in_memory()?;
    // Schema 18 declares columns with Anki's own collation.
    conn.create_collation("unicase", |a, b| a.to_lowercase().cmp(&b.to_lowercase()))?;
    // SAFETY: the buffer comes from `sqlite3_malloc64`, as `OwnedData` requires, and is fully initialized.
    let data = unsafe {
        let ptr = ffi::sqlite3_malloc64(bytes.len() as u64) as *mut u8;
        let ptr = NonNull::new(ptr).ok_or(rusqlite::Error::SqliteFailure(
            ffi::Error::new(ffi::SQLITE_NOMEM),
            None,
        ))?;
        std::ptr::copy_nonoverlapping(bytes.as_ptr(), ptr.as_ptr(), bytes.len());
        OwnedData::from_raw_nonnull(ptr, bytes.len())
    };
    conn.deserialize(DatabaseName::Main, data, true)?;
    Ok(conn)
}

pub(super) fn has_table(conn: &Connection, name: &str) -> rusqlite::Result<bool> {
    conn.query_row(
        "SELECT count(*) FROM sqlite_master WHERE type = 'table' AND name = ?1",
        [name],
        |row| row.get::<_, i64>(0),
    )
    .map(|count| count > 0)
}
