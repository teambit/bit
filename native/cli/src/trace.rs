//! `BIT_NATIVE_TRACE=1` prints every dispatch decision to stderr: which
//! command ran natively, why one declined, and the exact delegated command.

use std::{env, fmt::Display};

pub fn enabled() -> bool {
    env::var_os("BIT_NATIVE_TRACE").is_some_and(|value| is_active_trace_value(&value))
}

fn is_active_trace_value(value: &std::ffi::OsStr) -> bool {
    let text = value.to_string_lossy();
    let trimmed = text.trim();
    !trimmed.is_empty()
        && trimmed != "0"
        && !["false", "off", "no"]
            .iter()
            .any(|word| trimmed.eq_ignore_ascii_case(word))
}

pub fn log(message: impl Display) {
    if enabled() {
        let rendered = message.to_string();
        eprintln!("bit-native: {}", rendered.trim_end_matches(['\r', '\n']));
    }
}
