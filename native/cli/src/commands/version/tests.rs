//! Unit tests for `bit version` CLI flag parsing ([`parse_json_flag`]) and text/JSON formatting ([`render_version`]).
//!
//! Verifies `-j`, `--json`, and `--json=true` / `--json=false` flag combinations across [`parse_json_flag`] and [`render_version`].

use super::{parse_json_flag, render_version};
use std::ffi::OsString;

/// Verifies `bit version` [`OsString`] JSON flag parsing via [`parse_json_flag`].
///
/// Checks `-j`, `--json`, `--json=false`, and rejection of `--no-json` and `--help`.
#[test]
fn parses_version_json_flags() {
    assert_eq!(parse_json_flag(&[OsString::from("version")]), Some(false));
    assert_eq!(parse_json_flag(&[OsString::from("version"), OsString::from("-j")]), Some(true));
    assert_eq!(parse_json_flag(&[OsString::from("version"), OsString::from("--json")]), Some(true));
    assert_eq!(
        parse_json_flag(&[OsString::from("version"), OsString::from("--json=false")]),
        Some(false),
    );
    assert_eq!(parse_json_flag(&[OsString::from("version"), OsString::from("--no-json")]), None);
    assert_eq!(parse_json_flag(&[OsString::from("version"), OsString::from("--help")]), None);
}

/// Verifies [`render_version`] in plain-text and JSON modes along with `--json=true` [`parse_json_flag`] parsing.
///
/// Ensures JSON output matches `{ "bit": "<version>" }` with pretty indentation.
#[test]
fn renders_version_text_and_json() {
    assert_eq!(render_version("1.2.3", false).unwrap(), "1.2.3");
    assert_eq!(render_version("1.2.3", true).unwrap(), "{\n  \"bit\": \"1.2.3\"\n}");
    assert_eq!(
        parse_json_flag(&[OsString::from("version"), OsString::from("--json=true")]),
        Some(true),
    );
}
