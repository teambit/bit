//! Windows console control handler installation ([`install`], [`restore`], [`Previous`], [`CTRL_C_EVENT`]) and restoration during `bit export`.

use std::io::{self, Write};
use windows_sys::Win32::System::Console::{CTRL_C_EVENT, SetConsoleCtrlHandler};
/// Placeholder state token for the Windows console control handler registration.
pub(super) type Previous = ();

/// Windows console control callback that intercepts [`CTRL_C_EVENT`] and prints the export warning.
unsafe extern "system" fn interrupt(kind: u32) -> i32 {
    if kind != CTRL_C_EVENT {
        return 0;
    }
    let bytes = super::message();
    if !bytes.is_empty() {
        let mut stdout = io::stdout().lock();
        let _ = stdout.write_all(bytes);
        let _ = stdout.flush();
    }
    1
}
/// Registers the Windows console control handler for `bit export`.
#[inline]
pub(super) fn install() -> io::Result<Previous> {
    // SAFETY: the console control callback has static lifetime and the documented ABI.
    if unsafe { SetConsoleCtrlHandler(Some(interrupt), 1) } == 0 {
        Err(io::Error::last_os_error())
    } else {
        Ok(())
    }
}
/// Unregisters the Windows console control handler installed by [`install`].
#[inline]
pub(super) fn restore(_previous: &Previous) {
    // SAFETY: this removes the exact static callback registered by install.
    unsafe {
        SetConsoleCtrlHandler(Some(interrupt), 0);
    }
}
