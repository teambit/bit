mod golden;

use super::{Document, parse};
use indexmap::IndexMap;
use pretty_assertions::assert_eq;
use serde_json::{Value, json};

#[test]
fn round_trips_match_comment_json() {
    for (name, input, expected, second) in golden::CASES {
        let document = Document::parse(input).unwrap_or_else(|error| panic!("{name}: {error}"));
        assert_eq!(document.to_string(), *expected, "{name}");
        // comment-json cannot always read its own output back (raw control
        // characters, line separators), and a second pass may differ.
        match (Document::parse(expected), second) {
            (Ok(again), Some(second)) => {
                assert_eq!(again.to_string(), *second, "{name}: second pass");
            }
            (Err(_), None) => {}
            (again, second) => {
                panic!("{name}: reparse {:?} disagrees with comment-json {second:?}", again.err())
            }
        }
    }
}

#[test]
fn policy_update_keeps_entry_comments_and_sorts() {
    let (_, input, ..) = golden::CASES
        .iter()
        .find(|(name, ..)| *name == "workspace")
        .unwrap();
    let mut document = Document::parse(input).unwrap();
    let path = ["teambit.dependencies/dependency-resolver", "policy", "dependencies"];
    let entries: IndexMap<String, Value> =
        [("is-odd".to_owned(), json!("1.0.0")), ("lodash".to_owned(), json!("^4.17.21"))]
            .into_iter()
            .collect();
    document.replace_entries(&path, &entries);
    assert_eq!(document.to_string(), golden::POLICY_EDIT);
}

#[test]
fn readded_property_keeps_comments_and_new_one_goes_last() {
    let (_, input, ..) = golden::CASES
        .iter()
        .find(|(name, ..)| *name == "workspace")
        .unwrap();
    let mut document = Document::parse(input).unwrap();
    assert!(document.remove(&["teambit.workspace/workspace"]));
    document.set(&["teambit.workspace/workspace"], &json!({ "name": "renamed" }));
    document.set(&["new-aspect"], &json!({ "nested": { "list": [1, "two"] } }));
    assert_eq!(document.to_string(), golden::READD_EDIT);
}

#[test]
fn parse_returns_plain_json_in_javascript_key_order() {
    let value =
        parse("// c\n{ \"b\": 1, \"10\": 2, \"a\": [true, null,], \"2\": -1.5e1, }").unwrap();
    assert_eq!(value, json!({ "2": -15, "10": 2, "b": 1, "a": [true, null] }));
    let keys: Vec<_> = value
        .as_object()
        .unwrap()
        .keys()
        .cloned()
        .collect();
    assert_eq!(keys, ["2", "10", "b", "a"]);
}

#[test]
fn get_set_and_assign() {
    let mut document = Document::parse("{\n  // keep\n  \"a\": { \"b\": 1 }\n}").unwrap();
    assert_eq!(document.get(&["a", "b"]), Some(json!(1)));
    assert_eq!(document.get(&["a", "missing"]), None);
    document.set(&["a", "c", "d"], &json!("x"));
    let source = json!({ "b": 2, "e": [] });
    document.assign(&["a"], source.as_object().unwrap());
    assert_eq!(document.value(), json!({ "a": { "b": 2, "c": { "d": "x" }, "e": [] } }));
    assert!(document.to_string().starts_with("{\n  // keep\n  \"a\": {"));
    assert!(!document.remove(&["a", "missing"]));
    assert!(document.remove(&["a", "c"]));
    assert_eq!(document.get(&["a", "c"]), None);
}

#[test]
fn rejects_what_json_parse_rejects() {
    for input in [
        "",
        "// only a comment",
        "{ 'a': 1 }",
        "{ a: 1 }",
        r#"{ "a": 01 }"#,
        r#"{ "a": .5 }"#,
        "[1 2]",
        r#"{ "a": 1 } x"#,
        r#"{ "a": undefined }"#,
        "/* open",
    ] {
        assert!(parse(input).is_err(), "{input:?} should not parse");
    }
}
