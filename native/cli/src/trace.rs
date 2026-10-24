//! `BIT_NATIVE_TRACE=1` prints every dispatch decision to stderr: which
//! command ran natively, why one declined, and the exact delegated command.

use std::{env, fmt::Display};

pub fn enabled() -> bool {
    env::var_os("BIT_NATIVE_TRACE").is_some_and(|value| !value.is_empty() && value != "0")
}

pub fn log(message: impl Display) {
    if enabled() {
        eprintln!("bit-native: {message}");
    }
}
