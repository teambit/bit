use super::{Subcommand, parse_subcommand};

#[test]
fn parses_show_json_and_unrecognized_subcommands() {
    assert_eq!(
        parse_subcommand(&["show", "comp1", "--json"]),
        Some(Subcommand::ShowJson("comp1".into())),
    );
    assert_eq!(
        parse_subcommand(&["show", "-j", "-s", "scope/comp1"]),
        Some(Subcommand::ShowJson("scope/comp1".into())),
    );
    assert_eq!(parse_subcommand(&["show", "comp1"]), None);
    assert_eq!(parse_subcommand(&["bogus"]), Some(Subcommand::Unrecognized("bogus".into())));
    assert_eq!(parse_subcommand(&["build", "comp1"]), None);
}
