//! Unit tests for formatting native-to-Node.js fallback trace warnings ([`fallback_message`]).

use super::fallback_message;

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
