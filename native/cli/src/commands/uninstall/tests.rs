//! Unit tests for `bit uninstall` positional package CLI argument extraction ([`parse_arguments`]).
//!
//! Verifies `--no-color` filtering and rejection of empty or flag-prefixed package arguments.

use super::parse_arguments;
use std::ffi::OsString;

/// Verifies [`parse_arguments`] extracts positional package names while ignoring `--no-color`.
#[test]
fn extracts_positional_package_names() {
    let args = [
        OsString::from("uninstall"),
        OsString::from("is-positive"),
        OsString::from("--no-color"),
        OsString::from("is-negative"),
    ];
    let packages = parse_arguments(&args).unwrap();
    assert_eq!(packages, vec!["is-positive", "is-negative"]);
}

/// Verifies that [`parse_arguments`] returns `None` when given an empty package string.
#[test]
fn ignores_empty_package_string() {
    let args = [OsString::from("uninstall"), OsString::from("")];
    let packages = parse_arguments(&args);
    assert!(packages.is_none());
}

/// Verifies that [`parse_arguments`] rejects a flag-like package name following `--`.
#[test]
fn declines_flag_like_trailing_package_after_double_dash() {
    let args = [OsString::from("uninstall"), OsString::from("--"), OsString::from("-bad")];
    assert!(parse_arguments(&args).is_none());
}
