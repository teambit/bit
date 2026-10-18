use super::{Options, selection};
#[test]
fn owner_selection_requires_the_owner_separator_and_preserves_scope_suffixes() {
    let options =
        Options { old: "old".into(), new: "new".into(), owner: true, ..Default::default() };
    assert_eq!(selection::scope("old.team", &options).as_deref(), Some("new.team"));
    assert_eq!(selection::scope("older.team", &options), None);
    assert_eq!(selection::scope("old", &options), None);
}
#[test]
fn scope_selection_keeps_namespaces_and_forces_owner_preservation() {
    let bitmap = serde_json::json!({"ui/button":{"name":"ui/button","rootDir":"button","scope":"","defaultScope":"old.team","version":""}});
    let options = Options {
        old: "old".into(),
        new: "new".into(),
        owner: true,
        refactor: true,
        ..Default::default()
    };
    let selected = selection::entries(&bitmap, &options).unwrap();
    assert_eq!(selected[0].source, "old.team/ui/button");
    assert_eq!(selected[0].target, "ui/button");
    assert!(selected[0].preserve);
    assert!(selected[0].refactor);
}

#[test]
fn scope_validation_matches_published_single_owner_separator_grammar() {
    for scope in ["owner.scope", "ab", "$scope!"] {
        assert!(selection::validate_scope(scope).is_ok());
    }
    for scope in ["a", ".scope", "scope.", "a.b.c", "Upper"] {
        assert!(selection::validate_scope(scope).is_err());
    }
}
