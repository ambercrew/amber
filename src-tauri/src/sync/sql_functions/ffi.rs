use std::ffi::{CString, c_int, c_void};
use std::sync::Arc;

use sqlx::SqliteConnection;
use tokio_rusqlite::ffi;

use super::clock::SyncClock;

/// Registers the `hlc_now()` and `device_id()` SQL functions on `connection`,
/// bound to `clock` as their app data. Per connection rather than process-wide
/// via `sqlite3_auto_extension`, so a statement always issues HLCs from the
/// clock of the database it writes to, even with two databases open.
pub(crate) async fn register_sync_sql_functions(
    connection: &mut SqliteConnection,
    clock: Arc<SyncClock>,
) -> Result<(), sqlx::Error> {
    let mut handle = connection.lock_handle().await?;
    // sqlx and `tokio_rusqlite` share one `libsqlite3-sys`, so this is the same
    // `sqlite3` handle type the FFI calls below expect.
    let db = handle.as_raw_handle().as_ptr();

    // SAFETY: `db` is a live connection held exclusively through `handle`, and
    // each registration owns an `Arc` clone that `drop_clock` releases.
    unsafe {
        create_function(db, c"hlc_now", hlc_now_function, clock.clone())?;
        create_function(db, c"device_id", device_id_function, clock)?;
    }

    Ok(())
}

type SqlFunction =
    unsafe extern "C" fn(*mut ffi::sqlite3_context, c_int, *mut *mut ffi::sqlite3_value);

unsafe fn create_function(
    db: *mut ffi::sqlite3,
    name: &std::ffi::CStr,
    function: SqlFunction,
    clock: Arc<SyncClock>,
) -> Result<(), sqlx::Error> {
    let code = unsafe {
        ffi::sqlite3_create_function_v2(
            db,
            name.as_ptr(),
            0,
            ffi::SQLITE_UTF8,
            Arc::into_raw(clock) as *mut c_void,
            Some(function),
            None,
            None,
            Some(drop_clock),
        )
    };

    if code != ffi::SQLITE_OK {
        return Err(sqlx::Error::Configuration(
            format!(
                "failed to register the '{}' sync SQL function: sqlite error {code}",
                name.to_string_lossy()
            )
            .into(),
        ));
    }

    Ok(())
}

/// The clock a function was registered with. Borrowed, never taken: sqlite owns
/// the `Arc` until it calls [`drop_clock`].
unsafe fn clock_of(ctx: *mut ffi::sqlite3_context) -> &'static SyncClock {
    unsafe { &*(ffi::sqlite3_user_data(ctx) as *const SyncClock) }
}

unsafe extern "C" fn drop_clock(ptr: *mut c_void) {
    unsafe {
        drop(Arc::from_raw(ptr as *const SyncClock));
    }
}

unsafe extern "C" fn hlc_now_function(
    ctx: *mut ffi::sqlite3_context,
    _argc: c_int,
    _argv: *mut *mut ffi::sqlite3_value,
) {
    unsafe {
        let Some(clock) = clock_of(ctx).try_get() else {
            result_error(ctx, "sync not initialized");
            return;
        };

        result_text(ctx, &clock.now().format());
    }
}

unsafe extern "C" fn device_id_function(
    ctx: *mut ffi::sqlite3_context,
    _argc: c_int,
    _argv: *mut *mut ffi::sqlite3_value,
) {
    unsafe {
        let Some(clock) = clock_of(ctx).try_get() else {
            result_error(ctx, "sync not initialized");
            return;
        };

        result_text(ctx, &clock.device_id().to_string());
    }
}

unsafe fn result_text(ctx: *mut ffi::sqlite3_context, value: &str) {
    unsafe {
        let Ok(cstring) = CString::new(value) else {
            result_error(ctx, "sync value contained a NUL byte");
            return;
        };
        let len = cstring.as_bytes().len() as c_int;
        ffi::sqlite3_result_text(ctx, cstring.into_raw(), len, Some(free_cstring));
    }
}

unsafe extern "C" fn free_cstring(ptr: *mut c_void) {
    unsafe {
        drop(CString::from_raw(ptr as *mut std::os::raw::c_char));
    }
}

unsafe fn result_error(ctx: *mut ffi::sqlite3_context, message: &str) {
    unsafe {
        let cstring = CString::new(message).unwrap_or_else(|_| c"sync error".to_owned());
        ffi::sqlite3_result_error(ctx, cstring.as_ptr(), -1);
    }
}
