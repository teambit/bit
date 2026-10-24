use super::{
    GetOpts, ListOpts, Subcommand,
    inspect::{
        collect_list_results,
        get::{collect_get_entries, render_get_text},
        render_list_table,
    },
    mutation::deep_merge,
    parse_subcommand,
};
use crate::commands::color::Chalk;
use serde_json::json;
use std::fs;

#[test]
fn parses_aspect_subcommands() {
    assert_eq!(parse_subcommand(&["list-core"]), Some(Subcommand::ListCore { json: false }));
    assert_eq!(parse_subcommand(&["list-core", "-j"]), Some(Subcommand::ListCore { json: true }));
    assert_eq!(
        parse_subcommand(&["list", "comp1", "-d", "-j"]),
        Some(Subcommand::List(ListOpts { pattern: Some("comp1".into()), debug: true, json: true })),
    );
    assert_eq!(
        parse_subcommand(&["get", "comp1", "teambit.component/forking", "--json"]),
        Some(Subcommand::Get(GetOpts {
            component: "comp1".into(),
            aspect_id: Some("teambit.component/forking".into()),
            debug: false,
            json: true,
        })),
    );
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

#[test]
fn lists_and_gets_component_aspects() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path();
    fs::create_dir_all(root.join("comp1")).unwrap();
    fs::write(root.join("comp1/index.js"), "module.exports = () => 1;\n").unwrap();
    fs::write(
        root.join("workspace.jsonc"),
        r#"{
            "teambit.workspace/workspace": { "defaultScope": "my-scope" },
            "teambit.workspace/variants": {
                "*": { "teambit.pkg/pkg": { "packageJson": { "private": true } } }
            }
        }"#,
    )
    .unwrap();
    fs::write(
        root.join(".bitmap"),
        r#"{
            "comp1": {
                "scope": "",
                "version": "",
                "mainFile": "index.js",
                "rootDir": "comp1",
                "config": {
                    "teambit.component/forking": { "forkedFrom": "other/comp1" }
                }
            }
        }"#,
    )
    .unwrap();

    let list_items = collect_list_results(root, Some("comp1"), Chalk::new(false)).ok().unwrap();
    let table_str = render_list_table(&list_items, true, Chalk::new(false), false);
    assert!(table_str.contains("my-scope/comp1"), "{table_str}");
    assert!(
        table_str.contains("teambit.component/forking (level: component) (origin: BitmapFile)"),
        "{table_str}",
    );
    assert!(
        table_str.contains(
            "teambit.pkg/pkg           (level: workspace) (origin: WorkspaceVariants)"
        ),
        "{table_str}",
    );

    let get_entries =
        collect_get_entries(root, "comp1", Some("teambit.component/forking"), Chalk::new(false))
            .ok()
            .unwrap();
    assert_eq!(get_entries.len(), 1);
    let get_str = render_get_text(&get_entries, Chalk::new(false));
    assert!(get_str.contains("name:   teambit.component/forking"), "{get_str}");
    assert!(get_str.contains(r#""forkedFrom": "other/comp1""#), "{get_str}");
}
