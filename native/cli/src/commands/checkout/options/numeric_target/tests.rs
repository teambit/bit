//! Unit tests for yargs-compatible numeric target string [`normalize`] behavior.
//!
//! Verifies scientific, hexadecimal, and decimal coercion rules alongside non-numeric target preservation.

use super::normalize;
/// Verifies that scientific, hexadecimal, and decimal target strings coerce like `yargs` number-then-string.
#[test]
fn scientific_hex_and_decimal_targets_follow_yargs_number_then_string() {
    for (raw, expected) in [
        ("38938e0", "38938"),
        ("123e-2", "1.23"),
        ("0xabc", "2748"),
        ("0XABC", "2748"),
        ("123.", "123"),
        (".123", "0.123"),
        ("-0", "0"),
        ("1e-7", "1e-7"),
        ("0x20000000000001", "9007199254740992"),
    ] {
        assert_eq!(normalize(raw), expected, "{raw}");
    }
}
/// Verifies that leading-zero, unsafe-integer, and non-numeric target strings preserve their exact spelling.
/// Prevents semver tags (`0.0.1`), relative heads (`head~2`), and hex prefixes (`abcdef1`) from coercing.
#[test]
fn leading_zero_unsafe_and_non_numeric_targets_keep_their_spelling() {
    for raw in
        ["0123", "0e1", "1E3", "+123", "9007199254740992", "1e21", "0.0.1", "head~2", "abcdef1"]
    {
        assert_eq!(normalize(raw), raw, "{raw}");
    }
}

/// Verifies that [`normalize`] preserves empty strings and plain decimal integers unchanged.
/// Covers `""`, `"0"`, and `"42"`.
#[test]
fn empty_and_plain_integer_targets_normalize_cleanly() {
    assert_eq!(normalize(""), "");
    assert_eq!(normalize("0"), "0");
    assert_eq!(normalize("42"), "42");
}
