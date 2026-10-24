use super::{Options, build_component_entry, parse_options};
use serde_json::json;

#[test]
fn parses_cat_scope_flags_and_declines_full() {
    assert_eq!(
        parse_options(&["--json", "--json-extra", "my-scope"]),
        Some(Options {
            scope_path: Some("my-scope".into()),
            full: false,
            json: true,
            json_extra: true,
        }),
    );
    assert_eq!(parse_options(&["-f"]), None);
    assert_eq!(parse_options(&["--full"]), None);
}

#[test]
fn builds_component_json_entry_with_extra_fields() {
    let raw = json!({
        "name": "comp1",
        "scope": "org.my-scope",
        "versions": { "0.0.1": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
        "head": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    });
    let opts = Options { scope_path: None, full: false, json: true, json_extra: true };
    let entry = build_component_entry(&raw, &opts).expect("component entry");
    assert_eq!(entry.id, "org.my-scope/comp1");
    let obj = entry.json_obj.expect("json obj");
    assert_eq!(obj["type"], "ModelComponent");
    assert_eq!(obj["bindingPrefix"], "@org");
    assert_eq!(obj["versions"]["0.0.1"]["hash"], "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    assert_eq!(obj["head"]["hash"], "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
}
