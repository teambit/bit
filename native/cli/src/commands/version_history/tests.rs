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
    assert_eq!(
        parse_subcommand(&["show", "comp1"]),
        Some(Subcommand::ShowText("comp1".into(), false)),
    );
    assert_eq!(parse_subcommand(&["bogus"]), Some(Subcommand::Unrecognized("bogus".into())));
    assert_eq!(
        parse_subcommand(&["build", "comp1"]),
        Some(Subcommand::Build("comp1".into(), None, None)),
    );
    assert_eq!(
        parse_subcommand(&["build", "--from-snap", "abc", "comp1", "--from-all-lanes"]),
        Some(Subcommand::Build("comp1".into(), Some("abc".into()), None)),
    );
    assert_eq!(
        parse_subcommand(&["build", "comp1", "--delete-existing"]),
        Some(Subcommand::Build("comp1".into(), None, None)),
    );
}
