use super::{Options, parse_options};

#[test]
fn parses_insights_list_flags() {
    assert_eq!(parse_options(&["-l"]), Some(Options { list: true, json: false }));
    assert_eq!(parse_options(&["--list", "--json"]), Some(Options { list: true, json: true }));
    assert_eq!(parse_options(&[]), None);
    assert_eq!(parse_options(&["circular"]), None);
    assert_eq!(parse_options(&["--list", "circular"]), None);
}
