use super::{Options, build_component_entry, build_lane_entry, parse_options};
use serde_json::json;

#[test]
fn parses_cat_scope_flags_including_full() {
    assert_eq!(
        parse_options(&["--json", "--json-extra", "my-scope"]),
        Some(Options {
            scope_path: Some("my-scope".into()),
            full: false,
            json: true,
            json_extra: true,
        }),
    );
    assert_eq!(
        parse_options(&["-f"]),
        Some(Options { scope_path: None, full: true, json: false, json_extra: false }),
    );
    assert_eq!(
        parse_options(&["--full"]),
        Some(Options { scope_path: None, full: true, json: false, json_extra: false }),
    );
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

#[test]
fn builds_lane_json_entry_with_extra_fields() {
    let raw = json!({
        "name": "dev",
        "scope": "org.my-scope",
        "hash": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        "log": { "date": "123", "username": "alice", "email": "a@b.c" },
        "components": [
            {
                "id": { "scope": "org.my-scope", "name": "comp1" },
                "head": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
            }
        ],
        "schema": "1.0.0"
    });
    let opts = Options { scope_path: None, full: false, json: true, json_extra: true };
    let entry =
        build_lane_entry(&raw, "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", &opts).expect("lane");
    assert_eq!(entry.id, "org.my-scope/dev");
    let obj = entry.json_obj.expect("json obj");
    assert_eq!(obj["type"], "Lane");
    assert_eq!(obj["_hash"], "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb");
    assert_eq!(obj["components"][0]["id"]["_legacy"]["name"], "comp1");
    assert_eq!(obj["components"][0]["head"]["hash"], "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
}
