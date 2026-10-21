use super::parse_unrecognized;

#[test]
fn parses_unrecognized_ws_config_subcommand() {
    assert_eq!(parse_unrecognized(&["foo"]), Some("foo"));
    assert_eq!(parse_unrecognized(&["foo", "--no-color"]), Some("foo"));
    assert_eq!(parse_unrecognized(&["write"]), None);
    assert_eq!(parse_unrecognized(&["clean"]), None);
    assert_eq!(parse_unrecognized(&["list"]), None);
    assert_eq!(parse_unrecognized(&["--help"]), None);
    assert_eq!(parse_unrecognized(&[]), None);
}
