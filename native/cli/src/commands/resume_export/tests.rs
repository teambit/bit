use super::{Options, parse_options};

#[test]
fn parses_resume_export_options() {
    assert_eq!(parse_options(&["id-1"]), None);
    assert_eq!(
        parse_options(&["id-1", "scope-a", "scope-b", "-d", "--force"]),
        Some(Options {
            export_id: "id-1".into(),
            remotes: vec!["scope-a".into(), "scope-b".into()],
            delete: true,
            force: true,
        }),
    );
}
