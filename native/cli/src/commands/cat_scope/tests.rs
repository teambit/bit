//! Unit tests for `cat-scope` [`parse_options`] and [`build_component_entry`] / [`build_lane_entry`] formatting.
//!
//! Verifies [`Options`] flag combinations (`--full`, `--json`, `--json-extra`) and scope table entry construction.

use super::{Options, build_component_entry, build_lane_entry, parse_options};
use serde_json::json;

/// Verifies [`parse_options`] for `bit cat-scope` flags including `-f` / `--full`, `--json`, and `--json-extra`.
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
    assert_eq!(
        parse_options(&["-fje", "my-scope"]),
        Some(Options {
            scope_path: Some("my-scope".into()),
            full: true,
            json: true,
            json_extra: true,
        }),
    );
    assert_eq!(
        parse_options(&["--full=true", "--json=false"]),
        Some(Options { scope_path: None, full: true, json: false, json_extra: false }),
    );
}

/// Verifies [`build_component_entry`] populates `ModelComponent`, `bindingPrefix`, `versions`, and `head` fields.
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

/// Verifies [`build_lane_entry`] populates `Lane`, `_hash`, and component head fields when `--json-extra` is enabled.
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

/// Verifies that [`parse_options`] returns `None` when given an unknown `cat-scope` flag.
/// Ensures unsupported flags decline native `cat-scope` execution.
#[test]
fn unknown_cat_scope_flag_returns_none() {
    assert_eq!(parse_options(&["--unknown-flag"]), None);
}
