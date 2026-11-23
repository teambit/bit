//! Unit tests for `bit doctor` [`table`] and [`list`] terminal rendering and ANSI escape stripping.
//!
//! Verifies double-line box drawing borders in [`table`] and [`Chalk`] ANSI sequence stripping width alignment across [`list`].

use super::{list, table};
use crate::commands::color::Chalk;
/// Verifies that [`table`] renders double-line outlines and single-line row separators.
#[test]
fn table_uses_published_double_outline_and_row_separators() {
    assert_eq!(
        table(&[vec!["a".into()], vec!["xyz".into()]]),
        "╔═════╗\n║ a   ║\n╟─────╢\n║ xyz ║\n╚═════╝\n",
    );
}
/// Verifies that [`Chalk`] ANSI color escapes in [`list`] do not alter computed table column widths.
#[test]
fn colors_do_not_increase_column_width() {
    let plain = list(Chalk::new(false));
    assert_eq!(super::strip(&list(Chalk::new(true))), plain);
    assert_eq!(plain.matches("╟").count(), 8);
}

/// Verifies that ANSI escape stripping preserves incomplete and multiline sequences while stripping valid SGR codes.
#[test]
fn debug_log_stripping_preserves_incomplete_and_multiline_escape_sequences() {
    assert_eq!(super::strip("a\u{1b}[31mb\u{1b}[0mc"), "abc");
    assert_eq!(super::strip("a\u{1b}[oops\nkeepm"), "a\u{1b}[oops\nkeepm");
    assert_eq!(super::strip("a\u{1b}oops"), "a\u{1b}oops");
}

/// Verifies that `strip` returns plain strings without ANSI escape sequences unchanged.
///
/// Ensures ASCII text without `\x1b` passes through verbatim.
#[test]
fn plain_string_without_ansi_escapes_is_returned_unchanged() {
    assert_eq!(super::strip("plain text without escapes"), "plain text without escapes");
}
