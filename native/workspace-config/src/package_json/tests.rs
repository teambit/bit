//! Unit tests for `package.json` [`detect_indent`] indentation and [`detect_newline`] newline detection in `bit-workspace-config`.
//!
//! Confirms `detect-indent` ([`detect_indent`], [`detects_indentation_like_detect_indent`]) and `detect-newline` ([`detect_newline`], [`detects_newlines_like_detect_newline`]) tie-breaking parity on JSON documents in `bit-workspace-config`.

use super::{detect_indent, detect_newline};

/// Verifies that [`detect_indent`] matches `detect-indent` across space, tab, single-line, and tie-break inputs.
#[test]
fn detects_indentation_like_detect_indent() {
    assert_eq!(detect_indent("{\n  \"a\": {\n    \"b\": 1\n  }\n}\n"), "  ");
    assert_eq!(detect_indent("{\n    \"a\": 1,\n    \"b\": 2\n}"), "    ");
    assert_eq!(detect_indent("{\n\t\"a\": {\n\t\t\"b\": 1\n\t}\n}"), "\t");
    assert_eq!(detect_indent(r#"{"a":1}"#), "");
    // The step most lines follow wins a tie of uses.
    assert_eq!(detect_indent("a\n  b\n  c\n  d\n      e\nf\n"), "  ");
}

/// Verifies that [`detect_newline`] matches `detect-newline` across single-line, CRLF, and LF-majority inputs.
#[test]
fn detects_newlines_like_detect_newline() {
    assert_eq!(detect_newline("{}"), None);
    assert_eq!(detect_newline("{\r\n}\r\n"), Some("\r\n"));
    assert_eq!(detect_newline("{\r\n}\n\n"), Some("\n"));
}

/// Verifies that [`detect_indent`] returns an empty string and [`detect_newline`] returns `None` for empty input.
#[test]
fn empty_input_has_empty_indent_and_no_newline() {
    assert_eq!(detect_indent(""), "");
    assert_eq!(detect_newline(""), None);
}
