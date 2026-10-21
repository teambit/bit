use super::{Subcommand, mutation::remove_env_from_map, parse_subcommand};
use serde_json::json;

#[test]
fn parses_envs_set_and_unset() {
    assert_eq!(
        parse_subcommand(&["set", "comp1", "teambit.react/react"]),
        Some(Subcommand::Set { pattern: "comp1".into(), env: "teambit.react/react".into() }),
    );
    assert_eq!(
        parse_subcommand(&["unset", "comp1"]),
        Some(Subcommand::Unset { pattern: "comp1".into() }),
    );
    assert_eq!(parse_subcommand(&["list"]), None);
    assert_eq!(parse_subcommand(&[]), None);
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
}
