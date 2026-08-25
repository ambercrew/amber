use std::ffi::{CString, c_int, c_void};
use std::sync::Once;

use tokio_rusqlite::ffi;

use super::sync_clock_static;

static REGISTER_SYNC_SQL_FUNCTIONS: Once = Once::new();

/// Registers the `hlc_now()` and `device_id()` SQL functions process-wide so any
/// sqlite connection opened afterwards (via `sqlite3_auto_extension`) can use them
/// in trigger bodies.
pub fn install_sync_sql_functions() {
    REGISTER_SYNC_SQL_FUNCTIONS.call_once(|| unsafe {
        ffi::sqlite3_auto_extension(Some(sync_functions_init));
    });
}

unsafe extern "C" fn sync_functions_init(
    db: *mut ffi::sqlite3,
    _err_msg: *mut *mut std::os::raw::c_char,
    _api: *const ffi::sqlite3_api_routines,
) -> c_int {
    unsafe {
        let hlc_now_name = CString::new("hlc_now").expect("static function name");
        ffi::sqlite3_create_function_v2(
            db,
            hlc_now_name.as_ptr(),
            0,
            ffi::SQLITE_UTF8,
            std::ptr::null_mut(),
            Some(hlc_now_function),
            None,
            None,
            None,
        );

        let device_id_name = CString::new("device_id").expect("static function name");
        ffi::sqlite3_create_function_v2(
            db,
            device_id_name.as_ptr(),
            0,
            ffi::SQLITE_UTF8,
            std::ptr::null_mut(),
            Some(device_id_function),
            None,
            None,
            None,
        );
    }

    ffi::SQLITE_OK
}

unsafe extern "C" fn hlc_now_function(
    ctx: *mut ffi::sqlite3_context,
    _argc: c_int,
    _argv: *mut *mut ffi::sqlite3_value,
) {
    unsafe {
        let Some(clock) = sync_clock_static() else {
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
        let Some(clock) = sync_clock_static() else {
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
