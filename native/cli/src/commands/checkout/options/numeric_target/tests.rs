use super::normalize;
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
#[test]
fn leading_zero_unsafe_and_non_numeric_targets_keep_their_spelling() {
    for raw in
        ["0123", "0e1", "1E3", "+123", "9007199254740992", "1e21", "0.0.1", "head~2", "abcdef1"]
    {
        assert_eq!(normalize(raw), raw, "{raw}");
    }
}
