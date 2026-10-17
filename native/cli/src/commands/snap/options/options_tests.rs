use super::{Options, parse};
use serde_json::json;

#[test]
fn ordinary_snaps() {
    assert_eq!(parse(&[]), Some(Options::default()));
    let options = parse(&["remote/one", "-m", "fix", "--skip-auto-snap"]).unwrap();
    assert_eq!(options.pattern.as_deref(), Some("remote/one"));
    assert_eq!(
        options.request(),
        json!({ "pattern": "remote/one", "message": "fix", "skipAutoSnap": true }),
    );
    assert!(
        parse(&["-u", "--unmerged"]).is_some_and(|options| options.unmodified && options.unmerged),
    );
}

#[test]
fn everything_else_is_left_to_node() {
    assert!(parse(&["--build"]).is_none());
    assert!(parse(&["-m"]).is_none());
    assert!(parse(&["-m", "--unmodified"]).is_none());
    assert!(parse(&["a", "b"]).is_none());
    assert!(parse(&["-u", "--unmodified"]).is_none());
}

#[test]
fn component_selector_grammar_is_retained_for_native_selection() {
    for pattern in ["$modified", "a* AND !b*", "{foo,bar}/*", "@(foo|bar)/*"] {
        let options = parse(&[pattern]).unwrap();
        assert_eq!(options.pattern.as_deref(), Some(pattern));
    }
}
