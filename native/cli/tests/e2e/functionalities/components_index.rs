//! `e2e/functionalities/components-index.e2e.ts`.

use crate::helper::{Helper, config, parse, remote};
use serde_json::json;

/// scope components index mechanism › after tagging a component
#[test]
fn after_tagging_exporting_removing_and_importing_component() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.create_component_bar_foo("module.exports = 'foo';");
    helper.add_component_bar_foo();
    helper.tag_component_bar_foo();

    let index_path = helper.scopes.local_path.join(".bit/index.json");
    let index_json = config::read_jsonc(&index_path);
    let components = index_json["components"].as_array().unwrap();
    assert_eq!(components.len(), 1);
    assert!(components[0].get("id").is_some());
    assert!(components[0].get("hash").is_some());
    assert_eq!(components[0]["isSymlink"].as_bool(), Some(false));

    remote::publish(&helper);
    let index_after_export = config::read_jsonc(&index_path);
    assert!(
        index_after_export["components"]
            .as_array()
            .unwrap()
            .iter()
            .filter_map(|item| item["id"]["scope"].as_str())
            .any(|scope| scope == helper.scopes.remote),
    );

    let list = parse(&helper.native("list --local-scope --json"));
    assert_eq!(list.as_array().unwrap().len(), 1);
    assert!(
        list[0]["id"]
            .as_str()
            .unwrap()
            .contains(&helper.scopes.remote),
    );

    helper.native("remove bar/foo --silent");
    let index_after_remove = config::read_jsonc(&index_path);
    assert_eq!(
        index_after_remove["components"]
            .as_array()
            .unwrap()
            .len(),
        0,
    );

    helper.re_init_workspace();
    helper.add_remote_scope();
    helper.native(&format!("import {}/bar/foo", helper.scopes.remote));
    let index_after_import = config::read_jsonc(&index_path);
    assert_eq!(
        index_after_import["components"]
            .as_array()
            .unwrap()
            .len(),
        1,
    );
}

/// scope components index mechanism › changing the index.json file manually to be empty
/// scope components index mechanism › outdated / out-of-sync index.json
#[test]
fn empty_index_reset_and_outdated_index_recovery() {
    let helper = Helper::new();
    helper.re_init_workspace();
    helper.create_component_bar_foo("module.exports = 'foo';");
    helper.add_component_bar_foo();
    helper.tag_component_bar_foo();

    let list_before = parse(&helper.native("list --local-scope --json"));
    assert_eq!(list_before.as_array().unwrap().len(), 1);

    let index_path = helper.scopes.local_path.join(".bit/index.json");
    config::write_json(&index_path, &json!([]), b"  ");

    let list_empty = parse(&helper.native("list --local-scope --json"));
    assert_eq!(list_empty.as_array().unwrap().len(), 0);

    let cat_scope = parse(&helper.run("cat-scope --json"));
    assert_eq!(cat_scope.as_array().unwrap().len(), 1);

    helper.native("init --reset");
    let index_rebuilt = config::read_jsonc(&index_path);
    assert_eq!(
        index_rebuilt["components"]
            .as_array()
            .unwrap()
            .len(),
        1,
    );

    helper.native("reset bar/foo");
    config::write_json(&index_path, &index_rebuilt, b"  ");

    let first_status = helper.cmd("status");
    assert!(!first_status.status.success());
    let combined = format!("{}{}", first_status.stdout, first_status.stderr);
    assert!(combined.contains("bar/foo"), "{combined}");

    helper.native("status");
}
