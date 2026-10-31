use super::classify;
use serde_json::json;
#[test]
fn equal_remote_matches_repeat_in_local_phase_before_reversed_remote_phase() {
    let local = vec!["old.scope/comp1".into(), "old.scope/comp2".into()];
    let remote = vec!["old.scope/comp1@0.0.1".into(), "old.scope/comp2@0.0.1".into()];
    let pool = vec![
        json!({"identity":"old.scope/comp1","version":"0.0.1"}),
        json!({"identity":"old.scope/comp2","version":"0.0.1"}),
    ];
    let (locals, remotes) = classify(&local, &remote, &pool);
    assert_eq!(
        locals,
        ["old.scope/comp1", "old.scope/comp2", "old.scope/comp1", "old.scope/comp2"],
    );
    assert_eq!(
        remotes,
        [
            "old.scope/comp2@0.0.1",
            "old.scope/comp1@0.0.1",
            "old.scope/comp2@0.0.1",
            "old.scope/comp1@0.0.1",
        ],
    );
}
#[test]
fn different_versions_are_not_equal_component_ids() {
    let local = vec!["old.scope/comp1".into()];
    let remote = vec!["old.scope/comp1@0.0.2".into()];
    let pool = vec![json!({"identity":"old.scope/comp1","version":"0.0.1"})];
    let (locals, remotes) = classify(&local, &remote, &pool);
    assert_eq!(locals, local);
    assert_eq!(remotes, remote);
}
