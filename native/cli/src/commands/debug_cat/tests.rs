use super::{
    IdJsonOptions, ObjectOptions,
    lookup::{diagnose_component_lookup_error, diagnose_lane_lookup_error},
    parse_id_json_options, parse_object_options, parse_single_id,
};
use crate::commands::color::Chalk;
use serde_json::json;
use std::fs;

#[test]
fn parses_cat_object_flags_and_hash() {
    let hash = "0123456789abcdef0123456789abcdef01234567";
    assert_eq!(
        parse_object_options(&[hash, "-p", "-s", "--headers"]),
        Some(ObjectOptions { hash: hash.to_owned(), pretty: true, stringify: true, headers: true }),
    );
    assert_eq!(parse_object_options(&["not-a-hash"]), None);
}

#[test]
fn parses_cat_component_and_version_history_flags() {
    assert_eq!(
        parse_id_json_options(&["comp1@0.0.1", "--json"]),
        Some(IdJsonOptions { id: "comp1@0.0.1".to_owned(), json: true }),
    );
    assert_eq!(parse_id_json_options(&["--help"]), None);
    assert_eq!(parse_single_id(&["my-lane"]), Some("my-lane".to_owned()));
}

#[test]
fn diagnoses_missing_lane_and_component_lookup_errors() {
    let temp = tempfile::tempdir().unwrap();
    fs::write(temp.path().join("scope.json"), r#"{"name":"my-scope","lanes":{"tracking":[]}}"#)
        .unwrap();
    let index = json!({
        "components": [
            { "id": { "scope": "scope-a", "name": "dup" }, "isSymlink": false, "hash": "111" },
            { "id": { "scope": "scope-b", "name": "dup" }, "isSymlink": false, "hash": "222" },
            { "id": { "scope": "scope-c", "name": "dup" }, "isSymlink": false, "hash": "333" },
        ],
        "lanes": [
            { "id": { "scope": "scope-a", "name": "shared" }, "hash": "aaa" },
            { "id": { "scope": "scope-b", "name": "shared" }, "hash": "bbb" },
        ],
    });
    fs::write(temp.path().join("index.json"), index.to_string()).unwrap();

    assert_eq!(
        diagnose_lane_lookup_error(temp.path(), "missing", false),
        Some(
            r#"lane "missing" was not found locally. Please try with scope name, e.g. my-org.my-scope/missing"#
                .into(),
        ),
    );
    assert_eq!(
        diagnose_lane_lookup_error(temp.path(), "shared", false),
        Some(
            r#"found more than one lane with the name "shared", please specify the scope in a form of "<scope>/shared""#
                .into(),
        ),
    );
    assert_eq!(
        diagnose_lane_lookup_error(temp.path(), "scope-a/missing", true),
        Some(r#"unable to find a lane "scope-a/missing""#.into()),
    );
    assert_eq!(
        diagnose_component_lookup_error(temp.path(), "ghost", "ghost", Chalk::new(false)),
        Some("scope.getParsedId, the component ghost must include a scope-name".into()),
    );
    assert_eq!(
        diagnose_component_lookup_error(
            temp.path(),
            "my-scope/ghost",
            "my-scope/ghost",
            Chalk::new(false),
        ),
        Some(r#"error: component "my-scope/ghost" was not found"#.into()),
    );
}
