use super::{capture, json};
#[test]
fn incoming_capture_never_invents_current_contents_or_version() {
    let destination =
        json!({"scope":"scope","name":"new","rootDir":"components/new","version":"a".repeat(40)});
    let current = capture("scope/new", &destination).unwrap();
    assert!(current.added);
    assert!(!current.hidden);
    assert_eq!(current.target.version, "");
    assert_eq!(current.target.current, json!({}));
    assert_eq!(current.files, json!([]));
    assert_eq!(current.target.directory, "components/new");
    assert!(capture("scope/different", &destination).is_err());
    for path in [".", "../outside", "/absolute", ""] {
        let mut bad = destination.clone();
        bad["rootDir"] = json!(path);
        assert!(capture("scope/new", &bad).is_err());
    }
}
