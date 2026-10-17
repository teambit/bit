//! Original add command grammar, tracking, main-file and ignore contracts.
pub(crate) mod support;

mod cleanup;
mod errors;
mod failures;
mod identity;
mod main_file;
mod options;
use crate::helper::config;
use std::fs;
use support::{compare, workspace};

#[test]
fn tracks_named_namespaced_and_single_level_components() {
    for (command, id) in [
        ("add bar -i bar/foo", "bar/foo"),
        ("add bar -n test", "test/bar"),
        ("add bar -i foo", "foo"),
    ] {
        let helper = workspace();
        helper.output_file("bar/foo.js", "module.exports=1;\n");
        let result = compare(&helper, command);
        assert!(result.status.success(), "{}", result.stderr);
        assert!(config::read_jsonc(&helper.scopes.local_path.join(".bitmap")).get(id).is_some());
    }
}

#[test]
fn already_owned_files_warn_without_creating_a_second_identity() {
    let helper = workspace();
    helper.output_file("bar/foo.js", "module.exports=1;\n");
    helper.run("add bar -i bar/foo");
    let result = compare(&helper, "add bar -i bar/new");
    assert!(result.stdout.contains("already used by component"));
    assert!(config::read_jsonc(&helper.scopes.local_path.join(".bitmap")).get("bar/new").is_none());
}

#[test]
fn ignored_files_and_fully_ignored_directories_match_node() {
    for ignored in ["bar/foo.js\nbar/foo3.js\n", "bar/*\n"] {
        let helper = workspace();
        for file in ["foo.js", "foo3.js", "boo.js", "index.js"] {
            helper.output_file(&format!("bar/{file}"), "module.exports=1;\n");
        }
        helper.output_file(".gitignore", ignored);
        compare(&helper, "add bar -i bar/foo");
    }
}

#[test]
fn embedded_scope_without_bitmap_is_recovered_before_tracking() {
    let helper = workspace();
    fs::create_dir(helper.scopes.local_path.join(".git")).unwrap();
    fs::rename(helper.scopes.local_path.join(".bit"), helper.scopes.local_path.join(".git/bit"))
        .unwrap();
    fs::remove_file(helper.scopes.local_path.join(".bitmap")).unwrap();
    helper.output_file("bar/foo.js", "module.exports=1;\n");
    compare(&helper, "add bar -i bar/foo");
    assert!(!helper.scopes.local_path.join(".bit").exists());
}
