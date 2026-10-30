use super::{
    Subcommand,
    inspect::{format_envs_list, render_env_get},
    mutation::remove_env_from_map,
    parse_subcommand,
};
use crate::commands::color::Chalk;
use serde_json::json;
use std::fs;

#[test]
fn parses_envs_subcommands() {
    assert_eq!(
        parse_subcommand(&["set", "comp1", "teambit.react/react"]),
        Some(Subcommand::Set { pattern: "comp1".into(), env: "teambit.react/react".into() }),
    );
    assert_eq!(
        parse_subcommand(&["unset", "comp1"]),
        Some(Subcommand::Unset { pattern: "comp1".into() }),
    );
    assert_eq!(
        parse_subcommand(&["list"]),
        Some(Subcommand::List { json: false, table_only: false }),
    );
    assert_eq!(
        parse_subcommand(&["list", "--json"]),
        Some(Subcommand::List { json: true, table_only: false }),
    );
    assert_eq!(parse_subcommand(&[]), Some(Subcommand::List { json: false, table_only: true }));
    assert_eq!(
        parse_subcommand(&["get", "comp1"]),
        Some(Subcommand::Get { component: "comp1".into(), services: None }),
    );
    assert_eq!(
        parse_subcommand(&["get", "comp1", "--services", "teambit.workspace/scripts"]),
        Some(Subcommand::Get {
            component: "comp1".into(),
            services: Some(vec!["teambit.workspace/scripts".into()]),
        }),
    );
}

#[test]
fn removes_existing_env_and_versioned_entry_from_config_map() {
    let mut cfg = json!({
        "my-scope/my-env@0.0.1": {},
        "teambit.envs/envs": { "env": "my-scope/my-env" },
        "teambit.component/forking": {}
    });
    let map = cfg.as_object_mut().expect("object");
    assert!(remove_env_from_map(map));
    assert!(!map.contains_key("my-scope/my-env@0.0.1"));
    assert!(!map.contains_key("teambit.envs/envs"));
    assert!(map.contains_key("teambit.component/forking"));
    assert!(!remove_env_from_map(map));
    assert!(map.contains_key("teambit.component/forking"));
}

#[test]
fn renders_envs_list_and_get_with_scripts() {
    let pairs = vec![
        ("my-scope/comp1".to_owned(), "my-scope/env-with-scripts".to_owned()),
        ("my-scope/env-with-scripts".to_owned(), "teambit.envs/env".to_owned()),
    ];
    let list_out = format_envs_list(&pairs, false, Chalk::new(false), false);
    assert!(list_out.contains("available envs in the workspace"), "{list_out}");
    assert!(list_out.contains("my-scope/comp1"), "{list_out}");
    assert!(list_out.contains("my-scope/env-with-scripts"), "{list_out}");

    let temp = tempfile::tempdir().unwrap();
    let root = temp.path();
    fs::create_dir_all(root.join("env-with-scripts")).unwrap();
    fs::create_dir_all(root.join("comp1")).unwrap();
    fs::write(
        root.join("env-with-scripts/env-with-scripts.bit-env.ts"),
        "import { Scripts } from '@teambit/scripts';\n\
         export class EnvWithScripts {\n\
           scripts() {\n\
             return Scripts.from({\n\
               'test-script': 'echo hello from script',\n\
             });\n\
           }\n\
         }\n",
    )
    .unwrap();
    fs::write(root.join("comp1/index.js"), "module.exports = () => 'hi';\n").unwrap();
    fs::write(
        root.join("workspace.jsonc"),
        r#"{
            "teambit.workspace/workspace": { "defaultScope": "my-scope" },
            "teambit.workspace/variants": {
                "env-with-scripts": { "teambit.envs/env": {} },
                "comp1": { "my-scope/env-with-scripts": {} }
            }
        }"#,
    )
    .unwrap();
    fs::write(
        root.join(".bitmap"),
        r#"{
            "env-with-scripts": {
                "scope": "",
                "version": "",
                "mainFile": "env-with-scripts.bit-env.ts",
                "rootDir": "env-with-scripts"
            },
            "comp1": {
                "scope": "",
                "version": "",
                "mainFile": "index.js",
                "rootDir": "comp1"
            }
        }"#,
    )
    .unwrap();

    let get_out = render_env_get(root, "comp1", None, Chalk::new(false)).ok().unwrap();
    assert!(get_out.contains("Environment: my-scope/env-with-scripts"), "{get_out}");
    assert!(get_out.contains("available scripts:"), "{get_out}");
    assert!(get_out.contains("test-script: echo hello from script"), "{get_out}");
}
