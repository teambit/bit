use super::{requested, staged_head};
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
        let chosen = requested(&[id.to_owned()], rows.clone()).unwrap();
        assert_eq!(chosen[0].0["id"]["name"], "one");
    }
    assert!(requested(&["one@2.0.0".to_owned()], rows).is_err());
}

#[test]
fn unscoped_identity_must_be_unambiguous() {
    let rows = vec![
        staged("scope.one", "one", "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"),
        staged("scope.two", "one", "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"),
    ];
    assert!(requested(&["one".to_owned()], rows.clone()).is_err());
    let chosen = requested(&["scope.two/one".to_owned()], rows).unwrap();
    assert_eq!(chosen[0].0["id"]["scope"], "scope.two");
}

#[test]
fn scoped_id_wins_over_name_containing_slash() {
    let rows = vec![
        staged("scope.one", "one", "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"),
        staged("scope.two", "scope.one/one", "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"),
    ];
    let chosen = requested(&["scope.one/one".to_owned()], rows.clone()).unwrap();
    assert_eq!(chosen[0].0["id"]["scope"], "scope.one");
    assert!(requested(&["scope.one/missing".to_owned()], rows).is_err());
}

#[test]
fn a_staged_tag_or_snap_is_the_exported_head() {
    let hash = "cccccccccccccccccccccccccccccccccccccccc";
    let tag = json!({"head":hash,"versions":{"1.0.0":hash},"state":{"versions":{"1.0.0":{"local":true}}}});
    assert_eq!(staged_head(&tag).unwrap(), ("1.0.0".to_owned(), hash.to_owned()));
    let snap = json!({"head":hash,"versions":{},"state":{"versions":{(hash):{"local":true}}}});
    assert_eq!(staged_head(&snap).unwrap(), (hash.to_owned(), hash.to_owned()));
    let older =
        json!({"head":"d".repeat(40),"versions":{},"state":{"versions":{(hash):{"local":true}}}});
    assert!(staged_head(&older).is_err(), "a local snap that is not the head");
    let unknown = json!({"head":hash,"versions":{},"state":{"versions":{"2.0.0":{"local":true}}}});
    assert!(staged_head(&unknown).is_err(), "a tag without a Version ref");
}
