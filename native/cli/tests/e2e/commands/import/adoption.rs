//! Strict whole-command parity for workspace adoption and dependent-path imports.
mod callbacks;
mod combined;
mod dependents;
mod destinations;
mod edge_policies;
mod installation;
mod output;
mod policy;
use crate::{
    commands::move_paths::support,
    helper::{Helper, Run, config, remote},
};
use serde_json::Value;
use std::fs;

fn exported(count: usize) -> Helper {
    let helper = support::workspace(count, true);
    remote::publish(&helper);
    helper.re_init_workspace_with(false);
    helper.add_remote_scope();
    helper
}
fn command(helper: &Helper, id: &str, flags: &str) -> String {
    format!("import {}/{id} -x {flags}", helper.scopes.remote)
}
fn untrack(helper: &Helper, name: &str) -> Value {
    let mut bitmap = support::bitmap(helper);
    let entry = bitmap
        .as_object_mut()
        .unwrap()
        .remove(name)
        .unwrap();
    config::write_json(&helper.scopes.local_path.join(".bitmap"), &bitmap, b"    ");
    entry
}
fn file(helper: &Helper, entry: &Value, name: &str) -> std::path::PathBuf {
    helper.scopes.local_path
        .join(entry["rootDir"].as_str().unwrap())
        .join(name)
}
#[test]
fn track_only_restores_entries_without_overwriting_existing_or_extra_source_files() {
    let helper = exported(2);
    support::setup(&helper, &command(&helper, "*", ""));
    let original = untrack(&helper, "comp1");
    untrack(&helper, "comp2");
    fs::write(file(&helper, &original, "index.js"), "module.exports='local edits';\n").unwrap();
    fs::write(file(&helper, &original, "extra.txt"), "untracked original bytes\n").unwrap();
    successful(&helper, &command(&helper, "*", "--track-only"));
    let after = support::bitmap(&helper);
    assert!(after.get("comp1").is_some());
    assert!(after.get("comp2").is_some());
    assert_eq!(
        fs::read(file(&helper, &original, "index.js")).unwrap(),
        b"module.exports='local edits';\n",
    );
    assert_eq!(
        fs::read(file(&helper, &original, "extra.txt")).unwrap(),
        b"untracked original bytes\n",
    );
}
#[test]
fn adoption_flags_without_ids_preserve_the_released_validation_errors() {
    for flag in ["--track-only", "--dependents", "--dependents-via scope/comp"] {
        let helper = exported(1);
        let result = compare(&helper, &format!("import -x {flag}"));
        assert!(!result.status.success());
        assert!(result.stderr.contains("you have to specify ids"));
    }
}

fn compare(helper: &Helper, command: &str) -> Run {
    support::compare_with_stdout(helper, command, output::durations)
}

#[test]
fn sequential_imports_of_equal_names_use_the_incoming_owner_directory() {
    use crate::commands::move_paths::support::setup as canonical;
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    let mut remotes = Vec::new();
    for owner in ["first-owner", "second-owner"] {
        helper.re_init_workspace();
        let (_, path) = helper.new_bare_scope();
        let scope = format!("{owner}.shared");
        crate::helper::config::update_scope_json(&path.join("scope.json"), |value| {
            value.insert("name".into(), serde_json::json!(scope));
        });
        helper.add_remote(&path);
        crate::helper::config::set_workspace_key(
            &helper.scopes.local_path,
            "teambit.workspace/workspace",
            serde_json::json!({"defaultScope":scope,"defaultDirectory":"{scope}/{name}"}),
        );
        helper.output_file("alpha/index.js", &format!("module.exports = '{owner}';\n"));
        canonical(&helper, "add alpha -i alpha");
        canonical(&helper, "tag --message initial");
        remote::publish_to(&helper, &path);
        remotes.push(path);
    }
    helper.re_init_workspace();
    for path in &remotes {
        helper.add_remote(path);
    }
    crate::helper::config::set_workspace_key(
        &helper.scopes.local_path,
        "teambit.workspace/workspace",
        serde_json::json!({"defaultScope":"first-owner.shared","defaultDirectory":"{scope}/{name}"}),
    );
    canonical(&helper, "import first-owner.shared/alpha -x");
    let remote_state = remotes
        .iter()
        .map(|path| support::tree(path))
        .collect::<Vec<_>>();
    successful(&helper, "import second-owner.shared/alpha -x");
    let bitmap = helper.read_bit_map();
    assert_eq!(bitmap["first-owner.shared/alpha"]["rootDir"], "shared/alpha");
    assert_eq!(bitmap["second-owner.shared/alpha"]["rootDir"], "second-owner/shared/alpha");
    successful(&helper, "import second-owner.shared/alpha -x");
    assert_eq!(
        remotes
            .iter()
            .map(|path| support::tree(path))
            .collect::<Vec<_>>(),
        remote_state,
    );
}
fn successful(helper: &Helper, command: &str) -> Run {
    let result = compare(helper, command);
    assert!(result.status.success(), "{command}: {} {}", result.stdout, result.stderr);
    result
}
