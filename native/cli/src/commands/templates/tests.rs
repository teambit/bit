use super::{Options, parse_options};

#[test]
fn parses_templates_options() {
    assert_eq!(
        parse_options(&["--show-all", "--aspect", "my-aspect", "--json"]),
        Some(Options { show_all: true, aspect: Some("my-aspect".to_owned()), json: true }),
    );
    assert_eq!(parse_options(&["unexpected"]), None);
}
