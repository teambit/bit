//! `ExportMain` protects remote communication from Ctrl+C, then restores the prior handler.
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

static ACTIVE: AtomicBool = AtomicBool::new(false);
static ENABLED: AtomicBool = AtomicBool::new(false);
static COLOR: AtomicBool = AtomicBool::new(false);
const PLAIN: &str = "⚠ unable to cancel the export process at this point because the communication with the remote already started\n";
const COLORED: &str = "\u{1b}[33m⚠\u{1b}[39m \u{1b}[33munable to cancel the export process at this point because the communication with the remote already started\u{1b}[39m\n";

pub(super) struct Guard(platform::Previous);
impl Guard {
    pub(super) fn new(quiet: bool) -> io::Result<Self> {
        if ACTIVE.compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire).is_err() {
            return Err(io::Error::other("export interrupt owner already active"));
        }
        let disabled = env::var("BIT_DISABLE_SPINNER")
            .is_ok_and(|value| {
                matches!(
                    value
                        .trim()
                        .to_ascii_lowercase()
                        .as_str(),
                    "true" | "1" | "yes" | "y" | "on",
                )
            });
        ENABLED.store(!quiet && !disabled, Ordering::Release);
        COLOR.store(
            Chalk::detect(&env::args_os().collect::<Vec<_>>()).enabled(),
            Ordering::Release,
        );
        match platform::install() {
            Ok(previous) => Ok(Self(previous)),
            Err(error) => {
                ACTIVE.store(false, Ordering::Release);
                Err(error)
            }
        }
    }
}
impl Drop for Guard {
    fn drop(&mut self) {
        platform::restore(&self.0);
        ACTIVE.store(false, Ordering::Release);
    }
}
fn message() -> &'static [u8] {
    if !ENABLED.load(Ordering::Acquire) {
        return b"";
    }
    if COLOR.load(Ordering::Acquire) { COLORED.as_bytes() } else { PLAIN.as_bytes() }
}
