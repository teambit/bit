//! Unit tests for formatting native-to-`Node.js` CLI fallback trace warnings ([`fallback_message`]).
//!
//! Verifies command name and decline reason formatting in `BIT_NATIVE_TRACE` messages produced by [`fallback_message`].

use super::fallback_message;

/// Verifies [`fallback_message`] includes the command name and decline reason in `BIT_NATIVE_TRACE` stderr format.
///
/// Checks both `status` and `diff` trace warning strings.
#[test]
fn the_fallback_warning_names_the_command_and_the_reason() {
    assert_eq!(
        fallback_message("status", "status aspect settings require Harmony"),
        "\u{26A0} bit-native: `status` runs on the Node.js CLI: status aspect settings require Harmony",
    );
    assert_eq!(
        fallback_message("diff", "outside the native grammar"),
        "\u{26A0} bit-native: `diff` runs on the Node.js CLI: outside the native grammar",
    );
}

/// Verifies that [`fallback_message`] starts with the `\u{26A0} bit-native:` warning prefix.
///
/// Ensures `BIT_NATIVE_TRACE` stderr output is consistently identifiable across commands.
#[test]
fn fallback_warning_starts_with_warning_symbol() {
    assert!(fallback_message("export", "unsupported flag").starts_with("\u{26A0} bit-native:"));
}
