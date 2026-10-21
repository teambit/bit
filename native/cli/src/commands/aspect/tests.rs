use super::{Subcommand, mutation::deep_merge, parse_subcommand};
use serde_json::json;

#[test]
fn parses_aspect_subcommands() {
    assert_eq!(parse_subcommand(&["list-core"]), Some(Subcommand::ListCore { json: false }));
    assert_eq!(parse_subcommand(&["list-core", "-j"]), Some(Subcommand::ListCore { json: true }));
    assert_eq!(
        parse_subcommand(&["set", "comp1", "teambit.component/forking", r#"{"a":1}"#, "-m"]),
        Some(Subcommand::Set {
            pattern: "comp1".into(),
            aspect_id: "teambit.component/forking".into(),
            config: json!({"a": 1}),
            merge: true,
        }),
    );
    assert_eq!(
        parse_subcommand(&["unset", "comp1", "teambit.component/forking"]),
        Some(Subcommand::Unset {
            pattern: "comp1".into(),
            aspect_id: "teambit.component/forking".into(),
        }),
    );
    assert_eq!(parse_subcommand(&["bogus"]), Some(Subcommand::Unrecognized("bogus".into())));
}

#[test]
fn deep_merges_nested_objects() {
    let mut target = json!({"a": {"x": 1, "y": 2}, "b": 3});
    deep_merge(&mut target, &json!({"a": {"y": 20, "z": 30}}));
    assert_eq!(target, json!({"a": {"x": 1, "y": 20, "z": 30}, "b": 3}));
}
