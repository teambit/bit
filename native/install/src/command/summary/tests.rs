//! Unit tests for install summary formatting ([`format`], [`output`]) and elapsed duration rendering ([`seconds`]) in
//! `bit-install` CLI output.

use super::{format, seconds};
use crate::output::Output;
use std::{sync::Arc, time::Duration};

/// Creates a quiet test [`Output`] sink with ANSI colors disabled.
fn output() -> Output {
    Output::new(false, false, true, Arc::new(|_: &str| {}))
}

/// Verifies that [`seconds`] formats durations in seconds without trailing zeros like `JavaScript` number formatting ([`Duration`], [`format`]).
#[test]
fn prints_seconds_like_javascript() {
    assert_eq!(seconds(Duration::from_millis(437_197)), "437.197");
    assert_eq!(seconds(Duration::from_millis(1_500)), "1.5");
    assert_eq!(seconds(Duration::from_secs(2)), "2");
    assert_eq!(seconds(Duration::from_millis(40)), "0.04");
}

/// Verifies [`format`] output using [`output`] when all components install and compile cleanly.
#[test]
fn formats_the_summary() {
    let text = format(&output(), 3, Duration::from_millis(1_250), false, &[]);
    assert_eq!(
        text,
        "\nSuccessfully installed dependencies and compiled 3 component(s) in 1.25 seconds",
    );
}

/// Verifies that [`format`] prompts for another `bit install` when legacy environments failed to load.
#[test]
fn asks_for_another_install_when_legacy_envs_did_not_load() {
    let text = format(&output(), 1, Duration::from_secs(1), false, &["org.scope/env".into()]);
    assert!(text.starts_with("\nBit was not able to install all dependencies. Please run \"bit install\" again (or use the \"--recurring-install\" option next time).\nThe following environments"));
    assert!(text.contains("fix the warning: org.scope/env\nRead more"));
    let recurring = format(&output(), 1, Duration::from_secs(1), true, &["org.scope/env".into()]);
    assert!(recurring.contains("again \nThe following"));
}
