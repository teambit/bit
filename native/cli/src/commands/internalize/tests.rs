use super::{Options, parse_options};

#[test]
fn parses_internalize_flags_and_pattern() {
    assert_eq!(
        parse_options(&["comp1"]),
        Some(Options { pattern: Some("comp1".into()), revert: false, list: false, json: false }),
    );
    assert_eq!(
        parse_options(&["comp1", "-r", "-j"]),
        Some(Options { pattern: Some("comp1".into()), revert: true, list: false, json: true }),
    );
    assert_eq!(
        parse_options(&["--list", "--json", "--no-color"]),
        Some(Options { pattern: None, revert: false, list: true, json: true }),
    );
    assert_eq!(
        parse_options(&[]),
        Some(Options { pattern: None, revert: false, list: false, json: false }),
    );
    assert_eq!(parse_options(&["$internal"]), None);
    assert_eq!(parse_options(&["comp1", "comp2"]), None);
}
