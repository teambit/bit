//! Unix `SIGINT` signal handler installation ([`install`], [`restore`], [`Previous`]) and restoration during `bit export`.

use std::{io, mem::MaybeUninit};
/// Saved `libc::sigaction` disposition restored when the export interrupt guard drops.
pub(super) type Previous = libc::sigaction;

/// Async-signal-safe `SIGINT` handler installed by [`install`] that writes the export cancellation warning to stdout.
extern "C" fn interrupt(_signal: libc::c_int) {
    let bytes = super::message();
    if !bytes.is_empty() {
        // SAFETY: write is async-signal-safe and the immutable byte slice has static lifetime.
        unsafe {
            let _ = libc::write(libc::STDOUT_FILENO, bytes.as_ptr().cast(), bytes.len());
        }
    }
}
/// Registers the `SIGINT` handler for `bit export` and returns the [`Previous`] disposition.
#[inline]
pub(super) fn install() -> io::Result<Previous> {
    let mut previous = MaybeUninit::<libc::sigaction>::uninit();
    // SAFETY: a zeroed sigaction is initialized before registration; sigemptyset fills its mask.
    let mut action: libc::sigaction = unsafe { std::mem::zeroed() };
    action.sa_sigaction = interrupt as *const () as usize;
    action.sa_flags = libc::SA_RESTART;
    // SAFETY: both pointers reference valid sigaction storage; the handler has static lifetime.
    let failed = unsafe {
        libc::sigemptyset(&raw mut action.sa_mask) != 0
            || libc::sigaction(libc::SIGINT, &raw const action, previous.as_mut_ptr()) != 0
    };
    if failed {
        return Err(io::Error::last_os_error());
    }
    // SAFETY: successful sigaction initialized the previous-action output.
    Ok(unsafe { previous.assume_init() })
}
/// Restores the [`Previous`] `SIGINT` disposition captured by [`install`].
#[inline]
pub(super) fn restore(previous: &Previous) {
    // SAFETY: previous is the initialized disposition captured by install; no output is requested.
    unsafe {
        libc::sigaction(libc::SIGINT, previous, std::ptr::null_mut());
    }
}
