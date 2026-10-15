use super::fallback_message;

#[test]
fn the_fallback_warning_names_the_command_and_the_reason() {
    assert_eq!(
        fallback_message("status", "status aspect settings require Harmony"),
        "\u{26A0} bit-native: `status` runs on the Node.js CLI: status aspect settings require Harmony",
    );
}
