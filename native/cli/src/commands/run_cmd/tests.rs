//! Unit tests for `bit run` [`Options`] CLI parsing ([`parse_options`]).
//!
//! Verifies `--dev`, `--port`, `--watch`, `--no-browser`, and `--args` flag parsing.

use super::{Options, parse_options};

/// Verifies `bit run` [`Options`] flag parsing via [`parse_options`].
#[test]
fn parses_run_options() {
    assert_eq!(
        parse_options(&["my-app", "-d", "-p", "4000", "-w", "-n", "--args", "--flag"]),
        Some(Options {
            app_name: Some("my-app".into()),
            dev: true,
            port: Some("4000".into()),
            verbose: false,
            watch: true,
            no_browser: true,
            args: Some("--flag".into()),
        }),
    );
}

/// Verifies that [`parse_options`] parses an empty argument slice into [`Options::default`].
///
/// Ensures `bit run` without an app name retains `app_name: None` for single-app auto-selection.
#[test]
fn empty_run_args_parse_to_default_options() {
    assert_eq!(parse_options(&[]), Some(Options::default()));
}
