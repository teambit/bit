//! `ExportMain` protects remote communication ([`Guard`], [`ACTIVE`], [`ENABLED`]) from Ctrl+C, then restores the prior handler.
#[cfg(unix)]
mod unix;
#[cfg(windows)]
mod windows;

use crate::commands::color::Chalk;
use std::{
    env, io,
    sync::atomic::{AtomicBool, Ordering},
};

#[cfg(unix)]
use unix as platform;
#[cfg(windows)]
use windows as platform;

/// Flag indicating whether an export interrupt [`Guard`] is currently installed.
static ACTIVE: AtomicBool = AtomicBool::new(false);
/// Flag indicating whether Ctrl+C warning output is enabled on stdout.
static ENABLED: AtomicBool = AtomicBool::new(false);
/// Flag indicating whether ANSI color is enabled for the Ctrl+C warning message.
static COLOR: AtomicBool = AtomicBool::new(false);
/// Uncolored Ctrl+C warning printed when remote export communication has already started.
const PLAIN: &str = "⚠ unable to cancel the export process at this point because the communication with the remote already started\n";
/// ANSI-colored Ctrl+C warning printed when remote export communication has already started.
const COLORED: &str = "\u{1b}[33m⚠\u{1b}[39m \u{1b}[33munable to cancel the export process at this point because the communication with the remote already started\u{1b}[39m\n";

/// RAII guard that blocks `SIGINT` / Ctrl+C cancellation while remote export communication is active.
pub(super) struct Guard(platform::Previous);
impl Guard {
    /// Installs the [`platform`] Ctrl+C handler and activates the export interrupt [`Guard`] ([`ACTIVE`], [`ENABLED`], [`COLOR`]).
    #[inline]
    pub(super) fn new(quiet: bool) -> io::Result<Self> {
        if ACTIVE.compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire).is_err() {
            return Err(io::Error::other("export interrupt owner already active"));
        }
        let is_truthy_env = |name: &str| {
            env::var(name)
                .is_ok_and(|value| {
                    let trimmed = value
                        .trim()
                        .trim_matches(['"', '\''])
                        .trim();
                    ["true", "1", "yes", "y", "on"]
                        .iter()
                        .any(|truthy| trimmed.eq_ignore_ascii_case(truthy))
                })
        };
        let disabled = is_truthy_env("BIT_DISABLE_SPINNER") || is_truthy_env("BIT_DISABLE_CONSOLE");
        ENABLED.store(!quiet && !disabled, Ordering::Release);
        COLOR.store(
            Chalk::detect(&env::args_os().collect::<Vec<_>>()).enabled(),
            Ordering::Release,
        );
        platform::install()
            .inspect_err(|_| ACTIVE.store(false, Ordering::Release))
            .map(Self)
    }
}
impl Drop for Guard {
    fn drop(&mut self) {
        ENABLED.store(false, Ordering::Release);
        COLOR.store(false, Ordering::Release);
        platform::restore(&self.0);
        ACTIVE.store(false, Ordering::Release);
    }
}
/// Returns the plain or ANSI-colored Ctrl+C warning bytes when the interrupt guard is enabled.
#[inline]
fn message() -> &'static [u8] {
    if !ENABLED.load(Ordering::Acquire) {
        return b"";
    }
    if COLOR.load(Ordering::Acquire) { COLORED.as_bytes() } else { PLAIN.as_bytes() }
}
