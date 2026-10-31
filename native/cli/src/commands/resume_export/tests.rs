use super::{Options, parse_options};

#[test]
fn parses_resume_export_options() {
    assert_eq!(parse_options(&["id-1"]), None);
    assert_eq!(parse_options(&["id-1", "fixture.scope", "-d"]), None);
    assert_eq!(parse_options(&["id-1", "fixture.scope", "-f"]), None);
    assert_eq!(
        parse_options(&["id-1", "scope-a", "scope-b", "--delete", "--force"]),
        Some(Options {
            export_id: "id-1".into(),
            remotes: vec!["scope-a".into(), "scope-b".into()],
            delete: true,
            force: true,
        }),
    );
    assert_eq!(
        parse_options(&["id-1", "scope-a", "--delete=true", "--force=false"]),
        Some(Options {
            export_id: "id-1".into(),
            remotes: vec!["scope-a".into()],
            delete: true,
            force: false,
        }),
    );
}
