mod clock;
mod ffi;

use clock::sync_clock_static;

pub use clock::{device_id, initialize, sync_clock};
pub use ffi::install_sync_sql_functions;
