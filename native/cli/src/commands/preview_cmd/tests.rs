//! Unit tests for `bit preview` [`GenerateOptions`] ([`parse_generate_options`]) and [`ServeOptions`] ([`parse_serve_options`]) CLI parsing.
//!
//! Verifies `--name` and `--port` flag parsing and default option initialization.

use super::{GenerateOptions, ServeOptions, parse_generate_options, parse_serve_options};

/// Verifies `bit preview` generate and serve option parsing for `-n` and `-p`.
#[test]
fn parses_generate_and_serve_preview_options() {
    assert_eq!(
        parse_generate_options(&["ui/*", "-n", "compositions"]),
        Some(GenerateOptions { pattern: Some("ui/*".into()), name: Some("compositions".into()) }),
    );
    assert_eq!(parse_serve_options(&["-p", "3300"]), Some(ServeOptions { port: Some(3300) }));
    assert_eq!(parse_serve_options(&["--port=abc"]), None);
}

/// Verifies that empty argument slices parse to [`GenerateOptions::default`] and [`ServeOptions::default`].
#[test]
fn empty_preview_args_parse_to_defaults() {
    assert_eq!(parse_generate_options(&[]), Some(GenerateOptions::default()));
    assert_eq!(parse_serve_options(&[]), Some(ServeOptions::default()));
}
