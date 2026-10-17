use super::{requested, selection::staged as staged_versions};
use serde_json::{Value, json};

fn staged(scope: &str, name: &str, hash: &str) -> (Value, Value) {
    (
        json!({"id":{"scope":scope,"name":name},"hash":hash}),
        json!({"head":hash,"versions":{"1.0.0":hash}}),
    )
}

#[test]
fn resolves_scoped_and_unscoped_staged_ids() {
    let rows = vec![staged("scope.one", "one", "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")];
    for id in ["scope.one/one", "one", "one@1.0.0", "scope.one/one@1.0.0"] {
        let chosen = requested(&[id.to_owned()], rows.clone(), false).unwrap();
        assert_eq!(chosen[0].0["id"]["name"], "one");
    }
    assert!(requested(&["one@2.0.0".to_owned()], rows, false).is_err());
}

#[test]
fn unscoped_identity_must_be_unambiguous() {
    let rows = vec![
        staged("scope.one", "one", "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"),
        staged("scope.two", "one", "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"),
    ];
    assert!(requested(&["one".to_owned()], rows.clone(), false).is_err());
    let chosen = requested(&["scope.two/one".to_owned()], rows, false).unwrap();
    assert_eq!(chosen[0].0["id"]["scope"], "scope.two");
}

#[test]
fn scoped_id_wins_over_name_containing_slash() {
    let rows = vec![
        staged("scope.one", "one", "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"),
        staged("scope.two", "scope.one/one", "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"),
    ];
    let chosen = requested(&["scope.one/one".to_owned()], rows.clone(), false).unwrap();
    assert_eq!(chosen[0].0["id"]["scope"], "scope.one");
    assert!(requested(&["scope.one/missing".to_owned()], rows, false).is_err());
}

#[test]
fn every_local_version_is_exported_with_the_head() {
    let head = "cccccccccccccccccccccccccccccccccccccccc";
    let older = "dddddddddddddddddddddddddddddddddddddddd";
    let tag = json!({"head":head,"versions":{"1.0.0":head},"state":{"versions":{"1.0.0":{"local":true}}}});
    let staged_tag = staged_versions(&tag).unwrap();
    assert_eq!(staged_tag.head, head);
    assert_eq!(staged_tag.labels, ["1.0.0"]);
    assert_eq!(staged_tag.hashes, [head]);
    // A tag followed by a snap: both are exported, the snap is the head.
    let both = json!({"head":head,"versions":{"1.0.0":older},
        "state":{"versions":{"1.0.0":{"local":true},(head):{"local":true}}}});
    let staged_both = staged_versions(&both).unwrap();
    assert_eq!(staged_both.head, head);
    assert_eq!(staged_both.labels, ["1.0.0", head]);
    assert_eq!(staged_both.hashes, [older, head]);
    let not_head = json!({"head":head,"versions":{},"state":{"versions":{(older):{"local":true}}}});
    assert!(staged_versions(&not_head).is_err(), "the head must be a local version");
    let unknown = json!({"head":head,"versions":{},"state":{"versions":{"2.0.0":{"local":true}}}});
    assert!(staged_versions(&unknown).is_err(), "a tag without a Version ref");
}
