//! Published source-class callbacks mutate memory, not the original filesystem.
use crate::{
    commands::move_paths::support::{self, bitmap, setup, successful},
    helper::{Helper, config, remote},
};
use serde_json::json;
use std::fs;
fn configured(exported: bool) -> Helper {
    let helper = support::workspace(1, false);
    let source = include_str!("onload.cjs");
    helper.output_file("rename-env/index.js", source);
    setup(&helper, "add rename-env -i env/rename");
    config::set_component_env(&helper.scopes.local_path, "env/rename", "teambit.envs/env");
    setup(&helper, "link");
    helper.output_file("rename-env/dist/index.js", source);
    setup(&helper, "tag env/rename --ignore-issues * --message provider");
    if exported {
        setup(&helper, "tag comp1 --ignore-issues * --message original");
        remote::publish(&helper);
    }
    config::set_workspace_key(
        &helper.scopes.local_path,
        &format!("{}/env/rename", helper.scopes.remote),
        json!({}),
    );
    helper.output_file("rename-load-active", "active");
    helper
}
#[test]
fn exported_rename_materializes_in_memory_source_changes_without_touching_original() {
    let helper = configured(true);
    let original = fs::read(helper.scopes.local_path.join("comp1/index.js")).unwrap();
    let result = successful(&helper, "rename comp1 comp2 --deprecate");
    assert!(result.stdout.contains("rename source onLoad mutation"));
    assert_eq!(fs::read(helper.scopes.local_path.join("comp1/index.js")).unwrap(), original);
    let map = bitmap(&helper);
    let target = helper.scopes.local_path
        .join(map["comp2"]["rootDir"].as_str().unwrap())
        .join("index.js");
    let text = fs::read_to_string(target).unwrap();
    assert!(text.contains("// source onLoad mutation"));
    assert!(text.contains("comp2"));
}
#[test]
fn new_rename_reloads_the_target_consumer_after_renaming_the_bitmap_identity() {
    let helper = configured(false);
    let result = successful(&helper, "rename comp1 comp2");
    assert!(result.stdout.contains("rename source onLoad mutation"));
    let map = bitmap(&helper);
    let target = helper.scopes.local_path
        .join(map["comp2"]["rootDir"].as_str().unwrap())
        .join("index.js");
    let text = fs::read_to_string(target).unwrap();
    // New components are reloaded as comp2 before writeMany; the comp1-only hook
    // does not mutate that freshly loaded target class.
    assert!(!text.contains("// source onLoad mutation"));
    assert!(text.contains("// target onLoad mutation"));
    assert!(text.contains("comp2"));
}

#[test]
fn target_onload_failure_keeps_renamed_bitmap_but_original_sources_unwritten() {
    let helper = configured(false);
    helper.output_file("rename-target-load-fails", "fail");
    let original = fs::read(helper.scopes.local_path.join("comp1/index.js")).unwrap();
    let result = support::compare(&helper, "rename comp1 comp2");
    assert!(!result.status.success());
    assert!(result.stdout.contains("rename target onLoad mutation"));
    let map = bitmap(&helper);
    assert!(map.get("comp1").is_none());
    assert_eq!(map["comp2"]["rootDir"], "comp1");
    assert_eq!(fs::read(helper.scopes.local_path.join("comp1/index.js")).unwrap(), original);
    assert!(
        !helper.scopes.local_path
            .join(&helper.scopes.remote)
            .join("comp2")
            .exists(),
    );
}

#[test]
fn refactoring_preserves_the_loaded_dependents_in_memory_source_changes() {
    let helper = configured(false);
    helper.output_file(
        "dependent/index.js",
        &format!("module.exports=require('@{}/comp1');\n", helper.scopes.remote),
    );
    helper.output_file("dependent/companion.js", "module.exports='unchanged';\n");
    setup(&helper, "add dependent -i dependent");
    let result = successful(&helper, "rename comp1 comp2 --refactor");
    assert!(result.stdout.contains("rename dependent onLoad mutation"));
    let text = fs::read_to_string(helper.scopes.local_path.join("dependent/index.js")).unwrap();
    assert!(text.contains("// dependent onLoad mutation"));
    let companion =
        fs::read_to_string(helper.scopes.local_path.join("dependent/companion.js")).unwrap();
    assert!(companion.contains("// companion onLoad mutation"));
    assert!(text.contains(&format!("@{}/comp2", helper.scopes.remote)));
    assert!(!text.contains(&format!("@{}/comp1", helper.scopes.remote)));
}

#[test]
fn preserve_keeps_callback_source_changes_in_memory_without_import_replacement() {
    let helper = configured(false);
    let original = fs::read(helper.scopes.local_path.join("comp1/index.js")).unwrap();
    let result = successful(&helper, "rename comp1 comp2 --preserve");
    assert!(result.stdout.contains("rename target onLoad mutation"));
    assert_eq!(fs::read(helper.scopes.local_path.join("comp1/index.js")).unwrap(), original);
}
#[test]
fn preserve_refactoring_writes_all_loaded_files_only_for_a_changed_component() {
    let helper = configured(false);
    helper.output_file(
        "comp1/index.js",
        &format!("module.exports=require('@{}/comp1');\n", helper.scopes.remote),
    );
    helper.output_file("comp1/companion.js", "module.exports='unchanged';\n");
    setup(&helper, "add comp1 -i comp1");
    successful(&helper, "rename comp1 comp2 --preserve --refactor");
    let index = fs::read_to_string(helper.scopes.local_path.join("comp1/index.js")).unwrap();
    let companion =
        fs::read_to_string(helper.scopes.local_path.join("comp1/companion.js")).unwrap();
    assert!(index.contains(&format!("@{}/comp2", helper.scopes.remote)));
    assert!(index.contains("// target onLoad mutation"));
    assert!(companion.contains("// companion onLoad mutation"));
}
