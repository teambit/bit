use super::{format, parse};
use crate::commands::color::Chalk;
use serde_json::json;

#[test]
fn resolve_options() {
    let options = parse(&["--resolve", "-x", "remote/one", "-m", "done"]).unwrap();
    assert_eq!(
        (options.pattern.as_deref(), options.message.as_deref()),
        (Some("remote/one"), Some("done")),
    );
    assert!(parse(&["-x"]).is_none(), "a merge without --resolve");
    assert!(parse(&["--resolve", "--abort"]).is_none());
    assert!(parse(&["--resolve", "a", "b"]).is_none());
}

#[test]
fn resolved_components_are_listed_without_versions() {
    let result = json!({ "resolvedComponents": [{ "id": "s/a@0123456789abcdef0123456789abcdef01234567" }, { "id": "s/b@1.0.0" }] });
    let report = format(&result, Chalk::new(false)).unwrap();
    assert_eq!(report.data, "resolved components (2)\n   › s/a\n   › s/b");
    assert!(format(&json!({ "resolvedComponents": [], "other": 1 }), Chalk::new(false)).is_err());
}
