use super::{Options, parse_options};

#[test]
fn parses_eject_conf_flags_and_boolean_values() {
    assert_eq!(
        parse_options(&["bar/foo", "--propagate", "true", "--override"]),
        Some(Options {
            pattern: "bar/foo".into(),
            propagate: true,
            override_existing: true,
            json: false,
        }),
    );
    assert_eq!(
        parse_options(&["comp1", "-p", "-j"]),
        Some(Options {
            pattern: "comp1".into(),
            propagate: true,
            override_existing: false,
            json: true,
        }),
    );
    assert_eq!(parse_options(&[]), None);
}
