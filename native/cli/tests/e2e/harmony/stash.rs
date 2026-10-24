//! Published stash save/list/load state and detached repository-object parity.
mod checkout_edges;
mod cleanup;
mod detached;
mod error_startup;
mod flags;
mod support;
use crate::helper::{Helper, config};
use std::{fs, path::Path};
use support::{command, compare_stashes, controls, node, workspace, write_both};

#[test]
fn basic_save_and_load_restore_sources_without_advancing_heads() {
    let helper = workspace();
    let oracle = helper.clone_workspace();
    let before = controls(&helper.scopes.local_path);
    write_both(&helper, &oracle, "comp1/index.js", "console.log('stashed');\n");
    command(&helper, &oracle, "stash save");
    compare_stashes(&helper.scopes.local_path, &oracle);
    assert!(helper.scopes.local_path.join(".bit/stash/stash-1.json").is_file());
    let restored = fs::read(helper.scopes.local_path.join("comp1/index.js")).unwrap();
    assert_eq!(restored, fs::read(oracle.join("comp1/index.js")).unwrap());
    let expected =
        if cfg!(windows) { "console.log('base');\r\n\r\n" } else { "console.log('base');\n\n" };
    assert_eq!(restored, expected.as_bytes());
    assert_eq!(controls(&helper.scopes.local_path), before);
    compare_status(&helper, &oracle, 0);
    command(&helper, &oracle, "stash load");
    assert_eq!(
        fs::read(helper.scopes.local_path.join("comp1/index.js")).unwrap(),
        fs::read(oracle.join("comp1/index.js")).unwrap(),
    );
    assert!(!helper.scopes.local_path.join(".bit/stash/stash-1.json").exists());
    assert!(!oracle.join(".bit/stash/stash-1.json").exists());
    assert_eq!(controls(&helper.scopes.local_path), before);
    compare_status(&helper, &oracle, 1);
}
#[test]
fn manual_load_preserves_the_published_conflict_labels() {
    let helper = workspace();
    let oracle = helper.clone_workspace();
    write_both(&helper, &oracle, "comp1/index.js", "console.log('from-stash');\n");
    command(&helper, &oracle, "stash save");
    write_both(&helper, &oracle, "comp1/index.js", "console.log('local');\n");
    command(&helper, &oracle, "stash load --manual");
    let actual = fs::read_to_string(helper.scopes.local_path.join("comp1/index.js")).unwrap();
    assert_eq!(actual, fs::read_to_string(oracle.join("comp1/index.js")).unwrap());
    assert!(actual.contains("<<<<<<< 0.0.1 modified"));
    assert!(actual.contains(">>>>>>> stash"));
}
#[test]
fn stash_parent_remains_the_merge_base_after_a_new_tag() {
    shared_base(true);
}
#[test]
fn independent_local_edits_merge_using_the_saved_parent() {
    shared_base(false);
}
fn shared_base(tag: bool) {
    let helper = workspace();
    let oracle = helper.clone_workspace();
    write_both(
        &helper,
        &oracle,
        "comp1/index.js",
        "console.log('base');\n\n\nconsole.log('from-stash');\n\n",
    );
    command(&helper, &oracle, "stash save");
    write_both(&helper, &oracle, "comp1/index.js", "console.log('local');\n\n");
    if tag {
        helper.tag_without_build("comp1", "--message next");
        let expected = node(&oracle, "tag comp1 --message next");
        assert!(expected.status.success(), "{}", expected.stderr);
    }
    command(&helper, &oracle, "stash load");
    let actual = fs::read_to_string(helper.scopes.local_path.join("comp1/index.js")).unwrap();
    assert_eq!(actual, fs::read_to_string(oracle.join("comp1/index.js")).unwrap());
    assert!(actual.contains("from-stash"));
    assert!(actual.contains("local"));
    assert!(!actual.contains("base"));
}
#[test]
fn included_new_components_are_removed_and_restored_at_the_saved_root() {
    let helper = workspace();
    helper.output_file("nested/new/index.js", "module.exports='new';\n");
    helper.run("add nested/new -i fresh/component");
    let oracle = helper.clone_workspace();
    write_both(&helper, &oracle, "comp1/index.js", "console.log('stashed');\n");
    command(&helper, &oracle, "stash save --include-new");
    compare_stashes(&helper.scopes.local_path, &oracle);
    command(&helper, &oracle, "stash list");
    assert!(
        config::read_jsonc(&helper.scopes.local_path.join(".bitmap"))
            .get("fresh/component")
            .is_none(),
    );
    assert!(!helper.scopes.local_path.join("nested/new").exists());
    command(&helper, &oracle, "stash load");
    let bitmap = config::read_jsonc(&helper.scopes.local_path.join(".bitmap"));
    assert_eq!(bitmap["fresh/component"]["rootDir"], "nested/new");
    assert_eq!(bitmap["fresh/component"]["version"], "");
    assert_eq!(
        fs::read(helper.scopes.local_path.join("nested/new/index.js")).unwrap(),
        fs::read(oracle.join("nested/new/index.js")).unwrap(),
    );
}
fn compare_status(helper: &Helper, oracle: &Path, modified: usize) {
    let actual = helper.native_run("status --json");
    let expected = node(oracle, "status --json");
    assert!(actual.status.success(), "{}", actual.stderr);
    assert!(expected.status.success(), "{}", expected.stderr);
    let actual: serde_json::Value = serde_json::from_str(&actual.stdout).unwrap();
    let expected: serde_json::Value = serde_json::from_str(&expected.stdout).unwrap();
    assert_eq!(actual, expected);
    assert_eq!(
        actual["modifiedComponents"]
            .as_array()
            .unwrap()
            .len(),
        modified,
    );
}
