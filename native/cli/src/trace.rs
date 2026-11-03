//! `BIT_NATIVE_TRACE=1` prints every dispatch decision to stderr: which
//! command ran natively, why one declined, and the exact delegated command.
//!
//! Exposes [`enabled`], [`is_active_trace_value`], and [`log`] helpers for native dispatch inspection.

use std::{env, fmt::Display};

/// Return `true` when `BIT_NATIVE_TRACE` is set to an active truthy value via [`is_active_trace_value`].
#[must_use]
#[inline]
pub fn enabled() -> bool {
    env::var_os("BIT_NATIVE_TRACE").is_some_and(|value| is_active_trace_value(&value))
}

/// Returns `true` when `value` (`&OsStr`) is a non-empty, truthy `BIT_NATIVE_TRACE` setting checked by [`enabled`].
#[inline]
fn is_active_trace_value(value: &std::ffi::OsStr) -> bool {
    let text = value.to_string_lossy();
    let trimmed = text.trim();
    !trimmed.is_empty()
        && trimmed != "0"
        && !["false", "off", "no"]
            .iter()
            .any(|word| trimmed.eq_ignore_ascii_case(word))
}

/// Prints `bit-native: <message>` (`message`: [`Display`]) to `stderr` when [`enabled`] is `true`.
#[inline]
pub fn log(message: impl Display) {
    if enabled() {
        let rendered = message.to_string();
        eprintln!("bit-native: {}", rendered.trim_end_matches(['\r', '\n']));
    }
}
