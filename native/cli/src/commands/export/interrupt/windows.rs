use std::io::{self, Write};
use windows_sys::Win32::System::Console::{CTRL_C_EVENT, SetConsoleCtrlHandler};
pub(super) type Previous = ();

unsafe extern "system" fn interrupt(kind: u32) -> i32 {
    if kind != CTRL_C_EVENT {
        return 0;
    }
    let bytes = super::message();
    if !bytes.is_empty() {
        let mut stdout = io::stdout();
        let _ = stdout.write_all(bytes);
        let _ = stdout.flush();
    }
    1
}
pub(super) fn install() -> io::Result<Previous> {
    // SAFETY: the console control callback has static lifetime and the documented ABI.
    if unsafe { SetConsoleCtrlHandler(Some(interrupt), 1) } == 0 {
        return Err(io::Error::last_os_error());
    }
    Ok(())
}
pub(super) fn restore(_previous: &Previous) {
    // SAFETY: this removes the exact static callback registered by install.
    unsafe {
        SetConsoleCtrlHandler(Some(interrupt), 0);
    }
}
