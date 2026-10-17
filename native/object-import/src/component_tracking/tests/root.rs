use super::{Plan, facts, fixture, options, source};
use crate::component_tracking::{Options, identity, main_file};
use serde_json::json;
#[test]
fn root_requires_explicit_intent() {
    let root = fixture();
    assert!(
        Plan::prepare(&root, &root, &options(&["."]), &facts())
            .err()
            .unwrap()
            .to_string()
            .contains("without the --root flag"),
    );
    std::fs::remove_dir_all(root).unwrap();
}
#[test]
fn root_flag_rejects_ordinary_directory() {
    let root = fixture();
    source(&root, "foo/index.js");
    let mut options = options(&["foo"]);
    options.workspace_root = true;
    assert!(
        Plan::prepare(&root, &root, &options, &facts())
            .err()
            .unwrap()
            .to_string()
            .contains("none of the given paths"),
    );
    std::fs::remove_dir_all(root).unwrap();
}
#[test]
fn root_main_is_workspace_configuration() {
    assert_eq!(
        main_file::choose(
            "scope/root",
            ".",
            &["index.js".into(), "workspace.jsonc".into()],
            None,
            None
        )
        .unwrap(),
        "workspace.jsonc",
    );
}
#[test]
fn root_explicit_main_is_respected() {
    assert_eq!(
        main_file::choose(
            "scope/root",
            ".",
            &["index.js".into(), "workspace.jsonc".into()],
            Some("index.js"),
            None
        )
        .unwrap(),
        "index.js",
    );
}
#[test]
fn root_tracks_bitmap_but_not_scope() {
    let root = fixture();
    std::fs::write(root.join(".bit/private"), "secret").unwrap();
    let mut options = options(&["."]);
    options.workspace_root = true;
    options.id = Some("workspace".into());
    let plan = Plan::prepare(&root, &root, &options, &facts()).unwrap();
    let files = plan.components()[0]["files"].as_array().unwrap();
    assert!(
        files
            .iter()
            .any(|file| file == ".bitmap"),
    );
    assert!(
        !files
            .iter()
            .any(|file| file
                .as_str()
                .unwrap()
                .starts_with(".bit/")),
    );
    std::fs::remove_dir_all(root).unwrap();
}
#[test]
fn root_excludes_nested_component_sources() {
    let root = fixture();
    source(&root, "foo/index.js");
    let child = Plan::prepare(&root, &root, &options(&["foo"]), &facts()).unwrap();
    child.commit("2026-10-17-12-0-0").unwrap();
    let mut options = options(&["."]);
    options.workspace_root = true;
    options.id = Some("workspace".into());
    let plan = Plan::prepare(&root, &root, &options, &facts()).unwrap();
    assert!(
        !plan.components()[0]["files"]
            .as_array()
            .unwrap()
            .iter()
            .any(|file| file
                .as_str()
                .unwrap()
                .starts_with("foo/")),
    );
    std::fs::remove_dir_all(root).unwrap();
}
#[test]
fn root_config_selects_empty_env() {
    assert_eq!(
        identity::root_config(None, &Options::default()),
        json!({"teambit.harmony/empty-env":{},"teambit.envs/envs":{"env":"teambit.harmony/empty-env"}}),
    );
}
#[test]
fn root_preserves_existing_env() {
    let config = json!({"teambit.envs/envs":{"env":"scope/custom"},"scope/custom":{}});
    assert_eq!(identity::root_config(Some(&config), &Options::default()), config);
}
#[test]
fn root_added_env_overrides_existing_env() {
    let before = json!({"teambit.envs/envs":{"env":"scope/before"}});
    let options = Options {
        config: json!({"teambit.envs/envs":{"env":"scope/after"}}),
        ..Options::default()
    };
    assert_eq!(
        identity::root_config(Some(&before), &options)["teambit.envs/envs"]["env"],
        "scope/after",
    );
}
#[test]
fn root_preserves_unrelated_configuration() {
    let config = json!({"custom/aspect":{"value":1}});
    assert_eq!(
        identity::root_config(Some(&config), &Options::default())["custom/aspect"],
        config["custom/aspect"],
    );
}
#[test]
fn root_empty_added_configuration_keeps_existing_selection() {
    let before = json!({"teambit.envs/envs":{"env":"scope/custom"}});
    let options = Options { config: json!({}), ..Options::default() };
    assert_eq!(identity::root_config(Some(&before), &options), before);
}
#[test]
fn root_new_empty_env_does_not_remove_added_aspects() {
    let options = Options { config: json!({"custom/aspect":{}}), ..Options::default() };
    assert!(identity::root_config(None, &options).get("custom/aspect").is_some());
}
#[test]
fn root_existing_empty_env_is_stable() {
    let before = identity::root_config(None, &Options::default());
    assert_eq!(identity::root_config(Some(&before), &Options::default()), before);
}
#[test]
fn root_explicit_custom_env_needs_no_empty_env() {
    let options =
        Options { config: json!({"teambit.envs/envs":{"env":"custom/env"}}), ..Options::default() };
    assert!(identity::root_config(None, &options).get("teambit.harmony/empty-env").is_none());
}
#[test]
fn root_keeps_existing_empty_env_aspect_when_selection_changes() {
    let before = identity::root_config(None, &Options::default());
    let options =
        Options { config: json!({"teambit.envs/envs":{"env":"custom/env"}}), ..Options::default() };
    assert!(
        identity::root_config(Some(&before), &options).get("teambit.harmony/empty-env").is_some(),
    );
}
#[test]
fn root_can_retain_no_entry_point_other_than_workspace_configuration() {
    assert_eq!(
        main_file::choose("scope/root", ".", &["workspace.jsonc".into()], None, None).unwrap(),
        "workspace.jsonc",
    );
}
#[test]
fn root_existing_main_survives_retrack() {
    assert_eq!(
        main_file::choose("scope/root", ".", &["workspace.jsonc".into()], None, Some("README.md"))
            .unwrap(),
        "README.md",
    );
}
#[test]
fn root_dsl_explicit_missing_still_reports_missing() {
    assert!(
        main_file::choose("scope/root", ".", &["workspace.jsonc".into()], Some("missing.js"), None)
            .is_err(),
    );
}
