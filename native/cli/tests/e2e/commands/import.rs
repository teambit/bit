//! `e2e/commands/import.e2e.ts`.

mod fetch_deps;
mod history;
mod lanes;
mod policy;

use crate::{
    helper::{FOO_FIXTURE, Helper, Run, config, parse, setup},
    known_failure::{KnownResult, Native},
};
use serde_json::Value;
use std::{
    ffi::OsStr,
    fs,
    net::{TcpListener, TcpStream},
    path::Path,
    process::{Child, Stdio},
    thread,
    time::Duration,
};

struct ScopeServer(Child);

impl Drop for ScopeServer {
    fn drop(&mut self) {
        let _ = self.0.kill();
        let _ = self.0.wait();
    }
}

/// `importComponent(id)`: `bit import <remote>/<id>`, when it runs natively.
fn import(helper: &Helper, id: &str) -> KnownResult<String> {
    helper.native_output_or_known(&format!("import {}/{id}", helper.scopes.remote))
}

/// `runWithTryCatch`: stdout and stderr of a run that may fail.
fn combined(run: &Run) -> String {
    format!("{}{}", run.stdout, run.stderr)
}

/// `bitMap.read()`: `.bitmap` without its header comment.
fn read_bitmap(helper: &Helper) -> Value {
    let text = fs::read_to_string(helper.scopes.local_path.join(".bitmap")).unwrap();
    // The header comment holds no line starting with `{`.
    let body = text
        .find("\n{")
        .map_or(text.as_str(), |start| &text[start..]);
    parse(body)
}

/// `bitMap.expectToHaveId(name, version)`, or `expectNotToHaveId(name)` without a version.
fn expect_id(helper: &Helper, name: &str, version: Option<&str>) {
    let bitmap = read_bitmap(helper);
    match version {
        Some(version) => assert_eq!(bitmap[name]["version"], version, "{name} in {bitmap}"),
        None => assert!(bitmap.get(name).is_none(), "{name} in {bitmap}"),
    }
}

/// `fs.getConsumerFiles()`: the workspace's `.js` and `.ts` files, relative.
fn consumer_files(helper: &Helper) -> Vec<String> {
    let mut files = Vec::new();
    collect_files(&helper.scopes.local_path, &helper.scopes.local_path, &mut files);
    files
}

fn collect_files(root: &Path, dir: &Path, files: &mut Vec<String>) {
    for entry in fs::read_dir(dir).unwrap().flatten() {
        let path = entry.path();
        let kind = entry.file_type().unwrap();
        if kind.is_dir() {
            collect_files(root, &path, files);
        } else if path
            .extension()
            .is_some_and(|ext| ext == "js" || ext == "ts")
        {
            let relative = path.strip_prefix(root).unwrap();
            files.push(relative.to_string_lossy().replace('\\', "/"));
        }
    }
}

/// `workspaceJsonc.setComponentsDir(dir)`. The workspace's `workspace.jsonc` is plain JSON
/// once `reInitWorkspace` rewrote it.
fn set_components_dir(helper: &Helper, dir: &str) {
    let path = helper.scopes.local_path.join("workspace.jsonc");
    let mut config = parse(&fs::read_to_string(&path).unwrap());
    config["teambit.workspace/workspace"]["defaultDirectory"] = Value::String(dir.into());
    fs::write(path, serde_json::to_string_pretty(&config).unwrap()).unwrap();
}

/// A new workspace with the remote holding `global/simple@0.0.1`.
fn exported_simple() -> Helper {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.output_file("global/simple.js", FOO_FIXTURE);
    helper.run("add global -i global/simple");
    helper.tag_without_build("global/simple", "");
    crate::helper::remote::publish(&helper);
    helper.re_init_workspace();
    helper.add_remote_scope();
    helper
}

/// The default directory of `global/simple`.
fn simple_dir(helper: &Helper) -> std::path::PathBuf {
    helper.scopes.local_path.join(&helper.scopes.remote).join("global/simple")
}

/// The imported `bar/foo` modified locally, with the clone to come back to.
fn modified_bar_foo() -> (Helper, std::path::PathBuf) {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.create_component_bar_foo(FOO_FIXTURE);
    helper.add_component_bar_foo();
    helper.tag_without_build("", "");
    crate::helper::remote::publish(&helper);
    helper.re_init_workspace();
    helper.add_remote_scope();
    helper.run(&format!("import {}/bar/foo", helper.scopes.remote));
    let remote = helper.scopes.remote.clone();
    let v2 = "module.exports = function foo() { return 'got foo v2'; };";
    helper.output_file(&format!("{remote}/bar/foo/foo.js"), v2);
    let app = format!("const barFoo = require('./{remote}/bar/foo'); console.log(barFoo());");
    helper.output_file("app.js", &app);
    let clone = helper.clone_workspace();
    (helper, clone)
}

/// comp1 → comp2 → comp3 → comp4 exported, then comp2 (and comp1) tagged 0.0.2.
fn chain() -> Helper {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(4, true, "");
    helper.tag_without_build("", "");
    crate::helper::remote::publish(&helper);
    let comp2 = format!(
        "const comp3 = require('@{}/comp3');\nmodule.exports = () => 'comp2-v2 and ' + comp3();",
        helper.scopes.remote,
    );
    helper.output_file("comp2/index.js", &comp2);
    helper.tag_without_build("comp2", "");
    crate::helper::remote::publish(&helper);
    helper
}

/// Imports `id` with `flags` into a new workspace, when the import runs natively.
fn import_chain(helper: &Helper, id: &str, flags: &str) -> KnownResult<String> {
    helper.re_init_workspace();
    helper.add_remote_scope();
    helper.native_output_or_known(&format!("import {}/{id} {flags}", helper.scopes.remote))
}

/// stand alone component (without dependencies) › should display a successful message;
/// should indicate that the imported component is new; should add the component into
/// bit.map file
#[test]
fn a_stand_alone_component_is_imported() {
    let helper = exported_simple();
    let output = import(&helper, "global/simple").native();
    for expected in ["successfully imported one component", "global/simple", "0.0.1", "added"] {
        assert!(output.contains(expected), "{expected} in {output}");
    }
    assert!(!output.contains("updated"), "{output}");
    assert!(read_bitmap(&helper).get("global/simple").is_some());
}

#[test]
fn a_clean_imported_component_updates_like_node() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.create_component_bar_foo("module.exports = () => 'first';");
    helper.add_component_bar_foo();
    helper.tag_without_build("bar/foo", "");
    crate::helper::remote::publish(&helper);
    let source = helper.clone_workspace();
    helper.re_init_workspace();
    helper.add_remote_scope();
    helper.run(&format!("import {}/bar/foo -x", helper.scopes.remote));
    fs::write(source.join("bar/foo.js"), "module.exports = () => 'second';").unwrap();
    let command = "tag bar/foo --message second";
    let run = Helper::cmd_in_with(&source, command, &[("BIT_NATIVE", OsStr::new("off"))]);
    assert!(run.status.success(), "{command}: {}", combined(&run));
    crate::helper::remote::publish_at(&helper, &source);
    if let Some(destination) = std::env::var_os("BIT_NATIVE_IMPORT_UPDATE_BENCH_FIXTURE") {
        let destination = std::path::PathBuf::from(destination);
        assert!(!destination.exists());
        fs::create_dir_all(&destination).unwrap();
        setup::copy_dir(&helper.scopes.local_path, &destination.join("workspace"));
        setup::copy_dir(&helper.scopes.remote_path, &destination.join("remote"));
    }
    let node_root = helper.clone_workspace();
    let command = format!("import {}/bar/foo -x", helper.scopes.remote);
    let node = Helper::cmd_in_with(&node_root, &command, &[("BIT_NATIVE", OsStr::new("off"))]);
    assert!(node.status.success(), "{}", combined(&node));
    let native = helper.native_run(&command);
    assert!(native.native, "{}", native.trace);
    assert_eq!(native.status.code(), node.status.code());
    assert_eq!(without_progress_timing(&native.stdout), without_progress_timing(&node.stdout));
    assert_eq!(native.stderr, node.stderr);
    assert_eq!(
        fs::read(helper.scopes.local_path.join(".bitmap")).unwrap(),
        fs::read(node_root.join(".bitmap")).unwrap(),
    );
    let component = format!("{}/bar/foo/foo.js", helper.scopes.remote);
    assert_eq!(
        fs::read(helper.scopes.local_path.join(&component)).unwrap(),
        fs::read(node_root.join(&component)).unwrap(),
    );
}

fn without_progress_timing(output: &str) -> String {
    output
        .lines()
        .map(|line| {
            if line.starts_with("✔ importing components (completed in ") {
                "✔ importing components (completed)"
            } else {
                line
            }
        })
        .collect::<Vec<_>>()
        .join("\n")
}

#[test]
fn a_clean_import_updates_added_and_deleted_files_like_node() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.create_component_bar_foo("module.exports = () => 'first';");
    helper.output_file("bar/old.js", "module.exports = 'old';");
    helper.run("add bar -i bar/foo -m bar/foo.js");
    helper.tag_without_build("bar/foo", "");
    crate::helper::remote::publish(&helper);
    let source = helper.clone_workspace();
    helper.re_init_workspace();
    helper.add_remote_scope();
    helper.run(&format!("import {}/bar/foo -x", helper.scopes.remote));
    fs::remove_file(source.join("bar/old.js")).unwrap();
    fs::write(source.join("bar/new.js"), "module.exports = 'new';").unwrap();
    fs::write(source.join("bar/foo.js"), "module.exports = () => 'second';").unwrap();
    let command = "tag bar/foo --message second";
    let run = Helper::cmd_in_with(&source, command, &[("BIT_NATIVE", OsStr::new("off"))]);
    assert!(run.status.success(), "{command}: {}", combined(&run));
    crate::helper::remote::publish_at(&helper, &source);
    let node_root = helper.clone_workspace();
    let command = format!("import {}/bar/foo -x", helper.scopes.remote);
    let node = Helper::cmd_in_with(&node_root, &command, &[("BIT_NATIVE", OsStr::new("off"))]);
    assert!(node.status.success(), "{}", combined(&node));
    let native = helper.native_run(&command);
    assert!(native.native, "{}", native.trace);
    assert_eq!(native.status.code(), node.status.code());
    assert_eq!(without_progress_timing(&native.stdout), without_progress_timing(&node.stdout));
    assert_eq!(native.stderr, node.stderr);
    assert_eq!(
        fs::read(helper.scopes.local_path.join(".bitmap")).unwrap(),
        fs::read(node_root.join(".bitmap")).unwrap(),
    );
    let component = format!("{}/bar/foo", helper.scopes.remote);
    for file in ["foo.js", "new.js"] {
        assert_eq!(
            fs::read(helper.scopes.local_path.join(&component).join(file)).unwrap(),
            fs::read(node_root.join(&component).join(file)).unwrap(),
        );
    }
    assert_eq!(
        fs::read(helper.scopes.local_path.join(&component).join("old.js")).unwrap(),
        fs::read(node_root.join(&component).join("old.js")).unwrap(),
    );
}

#[test]
fn a_locally_modified_import_is_overridden_like_node() {
    let (helper, _) = modified_bar_foo();
    if let Some(destination) = std::env::var_os("BIT_NATIVE_IMPORT_OVERRIDE_BENCH_FIXTURE") {
        let destination = std::path::PathBuf::from(destination);
        assert!(!destination.exists());
        fs::create_dir_all(&destination).unwrap();
        setup::copy_dir(&helper.scopes.local_path, &destination.join("workspace"));
        setup::copy_dir(&helper.scopes.remote_path, &destination.join("remote"));
    }
    assert_override_import_matches_node(&helper);
}

#[test]
fn a_locally_modified_import_updates_to_a_newer_version_like_node() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.create_component_bar_foo("module.exports = () => 'first';");
    helper.add_component_bar_foo();
    helper.tag_without_build("bar/foo", "");
    crate::helper::remote::publish(&helper);
    let source = helper.clone_workspace();
    helper.re_init_workspace();
    helper.add_remote_scope();
    helper.run(&format!("import {}/bar/foo -x", helper.scopes.remote));
    helper.output_file(&format!("{}/bar/foo/foo.js", helper.scopes.remote), "local edit");
    fs::write(source.join("bar/foo.js"), "module.exports = () => 'second';").unwrap();
    let command = "tag bar/foo --message second";
    let run = Helper::cmd_in_with(&source, command, &[("BIT_NATIVE", OsStr::new("off"))]);
    assert!(run.status.success(), "{command}: {}", combined(&run));
    crate::helper::remote::publish_at(&helper, &source);
    assert_override_import_matches_node(&helper);
}

#[test]
fn a_clean_reimport_is_up_to_date_like_node() {
    let helper = exported_simple();
    let command = format!("import {}/global/simple -x", helper.scopes.remote);
    helper.run(&command);
    // Bitmap history names have one-second resolution.
    std::thread::sleep(std::time::Duration::from_millis(1100));
    let node_root = helper.clone_workspace();
    let node = Helper::cmd_in_with(&node_root, &command, &[("BIT_NATIVE", OsStr::new("off"))]);
    assert!(node.status.success(), "{}", combined(&node));
    let native = helper.native_run(&command);
    assert!(native.native, "{}", native.trace);
    assert_eq!(native.status.code(), node.status.code());
    assert_eq!(without_progress_timing(&native.stdout), without_progress_timing(&node.stdout));
    assert_eq!(native.stderr, node.stderr);
    assert_eq!(
        fs::read(helper.scopes.local_path.join(".bitmap")).unwrap(),
        fs::read(node_root.join(".bitmap")).unwrap(),
    );
}

#[test]
fn a_physically_deleted_import_is_restored_like_node() {
    let helper = exported_simple();
    let command = format!("import {}/global/simple -x", helper.scopes.remote);
    helper.run(&command);
    std::thread::sleep(std::time::Duration::from_millis(1100));
    fs::remove_dir_all(simple_dir(&helper)).unwrap();
    let node_root = helper.clone_workspace();
    let node = Helper::cmd_in_with(&node_root, &command, &[("BIT_NATIVE", OsStr::new("off"))]);
    assert!(node.status.success(), "{}", combined(&node));
    let native = helper.native_run(&command);
    assert!(native.native, "{}", native.trace);
    assert_eq!(native.status.code(), node.status.code());
    assert_eq!(without_progress_timing(&native.stdout), without_progress_timing(&node.stdout));
    assert_eq!(native.stderr, node.stderr);
    assert_eq!(
        fs::read(helper.scopes.local_path.join(".bitmap")).unwrap(),
        fs::read(node_root.join(".bitmap")).unwrap(),
    );
    let relative = format!("{}/global/simple/simple.js", helper.scopes.remote);
    assert_eq!(
        fs::read(helper.scopes.local_path.join(&relative)).unwrap(),
        fs::read(node_root.join(&relative)).unwrap(),
    );
}

#[test]
fn an_existing_empty_import_directory_matches_node() {
    let helper = exported_simple();
    fs::create_dir_all(simple_dir(&helper)).unwrap();
    assert_new_destination_matches_node(&helper, false);
}

#[test]
fn an_occupied_import_directory_with_override_matches_node() {
    let helper = exported_simple();
    let extra = simple_dir(&helper).join("my-file.js");
    fs::create_dir_all(extra.parent().unwrap()).unwrap();
    fs::write(&extra, "console.log()").unwrap();
    assert_new_destination_matches_node(&helper, true);
    assert_eq!(fs::read(extra).unwrap(), b"console.log()");
}

fn assert_new_destination_matches_node(helper: &Helper, override_existing: bool) {
    let node_root = helper.clone_workspace();
    let flag = if override_existing { " --override" } else { "" };
    let command = format!("import {}/global/simple -x{flag}", helper.scopes.remote);
    let node = Helper::cmd_in_with(&node_root, &command, &[("BIT_NATIVE", OsStr::new("off"))]);
    assert!(node.status.success(), "{}", combined(&node));
    let native = helper.native_run(&command);
    assert!(native.native, "{}", native.trace);
    assert_eq!(native.status.code(), node.status.code());
    assert_eq!(without_progress_timing(&native.stdout), without_progress_timing(&node.stdout));
    assert_eq!(native.stderr, node.stderr);
    assert_eq!(
        fs::read(helper.scopes.local_path.join(".bitmap")).unwrap(),
        fs::read(node_root.join(".bitmap")).unwrap(),
    );
    let relative = format!("{}/global/simple/simple.js", helper.scopes.remote);
    assert_eq!(
        fs::read(helper.scopes.local_path.join(&relative)).unwrap(),
        fs::read(node_root.join(&relative)).unwrap(),
    );
}

#[test]
fn the_path_option_materializes_a_new_component_like_node() {
    let helper = exported_simple();
    let node_root = helper.clone_workspace();
    let command = format!("import {}/global/simple -p my-custom-location -x", helper.scopes.remote);
    let node = Helper::cmd_in_with(&node_root, &command, &[("BIT_NATIVE", OsStr::new("off"))]);
    assert!(node.status.success(), "{}", combined(&node));
    let native = helper.native_run(&command);
    assert!(native.native, "{}", native.trace);
    assert_eq!(native.status.code(), node.status.code());
    assert_eq!(without_progress_timing(&native.stdout), without_progress_timing(&node.stdout));
    assert_eq!(native.stderr, node.stderr);
    assert_eq!(
        fs::read(helper.scopes.local_path.join(".bitmap")).unwrap(),
        fs::read(node_root.join(".bitmap")).unwrap(),
    );
    assert_eq!(
        fs::read(helper.scopes.local_path.join("my-custom-location/simple.js")).unwrap(),
        fs::read(node_root.join("my-custom-location/simple.js")).unwrap(),
    );
}

#[test]
fn a_custom_directory_template_materializes_like_node() {
    let helper = exported_simple();
    set_components_dir(&helper, "{scope}/-{name}-");
    let node_root = helper.clone_workspace();
    let command = format!("import {}/global/simple -x", helper.scopes.remote);
    let node = Helper::cmd_in_with(&node_root, &command, &[("BIT_NATIVE", OsStr::new("off"))]);
    assert!(node.status.success(), "{}", combined(&node));
    let native = helper.native_run(&command);
    assert!(native.native, "{}", native.trace);
    assert_eq!(native.status.code(), node.status.code());
    assert_eq!(without_progress_timing(&native.stdout), without_progress_timing(&node.stdout));
    assert_eq!(native.stderr, node.stderr);
    assert_eq!(
        fs::read(helper.scopes.local_path.join(".bitmap")).unwrap(),
        fs::read(node_root.join(".bitmap")).unwrap(),
    );
    let relative = format!("{}/-global/simple-/simple.js", helper.scopes.remote);
    assert_eq!(
        fs::read(helper.scopes.local_path.join(&relative)).unwrap(),
        fs::read(node_root.join(&relative)).unwrap(),
    );
}

#[test]
fn an_authored_component_reimports_at_its_bitmap_paths_like_node() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.create_component_bar_foo(FOO_FIXTURE);
    helper.add_component_bar_foo();
    helper.tag_without_build("", "");
    crate::helper::remote::publish(&helper);
    let bitmap = fs::read(helper.scopes.local_path.join(".bitmap")).unwrap();
    helper.re_init_workspace();
    helper.add_remote_scope();
    fs::write(helper.scopes.local_path.join(".bitmap"), bitmap).unwrap();
    if let Some(destination) = std::env::var_os("BIT_NATIVE_IMPORT_AUTHORED_FIXTURE") {
        let destination = std::path::PathBuf::from(destination);
        assert!(!destination.exists());
        fs::create_dir_all(&destination).unwrap();
        setup::copy_dir(&helper.scopes.local_path, &destination.join("workspace"));
        setup::copy_dir(&helper.scopes.remote_path, &destination.join("remote"));
    }
    let node_root = helper.clone_workspace();
    let command = format!("import {}/bar/foo -x", helper.scopes.remote);
    let node = Helper::cmd_in_with(&node_root, &command, &[("BIT_NATIVE", OsStr::new("off"))]);
    assert!(node.status.success(), "{}", combined(&node));
    let native = helper.native_run(&command);
    assert!(native.native, "{}", native.trace);
    assert_eq!(native.status.code(), node.status.code());
    assert_eq!(without_progress_timing(&native.stdout), without_progress_timing(&node.stdout));
    assert_eq!(native.stderr, node.stderr);
    assert_eq!(
        fs::read(helper.scopes.local_path.join(".bitmap")).unwrap(),
        fs::read(node_root.join(".bitmap")).unwrap(),
    );
    assert_eq!(
        fs::read(helper.scopes.local_path.join("bar/foo.js")).unwrap(),
        fs::read(node_root.join("bar/foo.js")).unwrap(),
    );
}

#[test]
fn a_local_tag_survives_reimport_like_node() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.create_component_bar_foo(FOO_FIXTURE);
    helper.add_component_bar_foo();
    helper.tag_without_build("", "");
    crate::helper::remote::publish(&helper);
    helper.re_init_workspace();
    helper.add_remote_scope();
    let remote = helper.scopes.remote.clone();
    helper.run(&format!("import {remote}/bar/foo --path components/bar/foo -x"));
    helper.output_file("components/bar/foo/foo.js", "v2");
    assert!(helper.tag_without_build("", "").contains("0.0.2"));
    // Bitmap history names have one-second resolution.
    std::thread::sleep(std::time::Duration::from_millis(1100));
    if let Some(destination) = std::env::var_os("BIT_NATIVE_IMPORT_LOCAL_TAG_FIXTURE") {
        let destination = std::path::PathBuf::from(destination);
        assert!(!destination.exists());
        fs::create_dir_all(&destination).unwrap();
        setup::copy_dir(&helper.scopes.local_path, &destination.join("workspace"));
        setup::copy_dir(&helper.scopes.remote_path, &destination.join("remote"));
    }
    let node_root = helper.clone_workspace();
    let command = format!("import {remote}/bar/foo -x");
    let node = Helper::cmd_in_with(&node_root, &command, &[("BIT_NATIVE", OsStr::new("off"))]);
    assert!(node.status.success(), "{}", combined(&node));
    let native = helper.native_run(&command);
    assert!(native.native, "{}", native.trace);
    assert_eq!(native.status.code(), node.status.code());
    assert_eq!(without_progress_timing(&native.stdout), without_progress_timing(&node.stdout));
    assert_eq!(native.stderr, node.stderr);
    assert_eq!(
        fs::read(helper.scopes.local_path.join(".bitmap")).unwrap(),
        fs::read(node_root.join(".bitmap")).unwrap(),
    );
    assert_eq!(
        fs::read(helper.scopes.local_path.join("components/bar/foo/foo.js")).unwrap(),
        fs::read(node_root.join("components/bar/foo/foo.js")).unwrap(),
    );
}

#[test]
fn an_overridden_destination_file_is_replaced_like_node() {
    let helper = exported_simple();
    let destination = simple_dir(&helper).join("simple.js");
    fs::create_dir_all(destination.parent().unwrap()).unwrap();
    fs::write(&destination, "pre-existing local body").unwrap();
    let node_root = helper.clone_workspace();
    let command = format!("import {}/global/simple --override -x", helper.scopes.remote);
    let node = Helper::cmd_in_with(&node_root, &command, &[("BIT_NATIVE", OsStr::new("off"))]);
    assert!(node.status.success(), "{}", combined(&node));
    let native = helper.native_run(&command);
    assert!(native.native, "{}", native.trace);
    assert_eq!(native.status.code(), node.status.code());
    assert_eq!(without_progress_timing(&native.stdout), without_progress_timing(&node.stdout));
    assert_eq!(native.stderr, node.stderr);
    assert_eq!(
        fs::read(helper.scopes.local_path.join(".bitmap")).unwrap(),
        fs::read(node_root.join(".bitmap")).unwrap(),
    );
    assert_eq!(
        fs::read(&destination).unwrap(),
        fs::read(node_root.join(destination.strip_prefix(&helper.scopes.local_path).unwrap()))
            .unwrap(),
    );
}

#[test]
fn a_modified_import_merges_manually_like_node() {
    let (helper, _) = modified_bar_foo();
    if let Some(destination) = std::env::var_os("BIT_NATIVE_IMPORT_MERGE_FIXTURE") {
        let destination = std::path::PathBuf::from(destination);
        assert!(!destination.exists());
        fs::create_dir_all(&destination).unwrap();
        setup::copy_dir(&helper.scopes.local_path, &destination.join("workspace"));
        setup::copy_dir(&helper.scopes.remote_path, &destination.join("remote"));
    }
    let node_root = helper.clone_workspace();
    let command = format!("import {}/bar/foo --merge=manual -x", helper.scopes.remote);
    let node = Helper::cmd_in_with(&node_root, &command, &[("BIT_NATIVE", OsStr::new("off"))]);
    assert!(node.status.success(), "{}", combined(&node));
    let native = helper.native_run(&command);
    assert!(native.native, "{}", native.trace);
    assert_eq!(native.status.code(), node.status.code());
    assert_eq!(without_progress_timing(&native.stdout), without_progress_timing(&node.stdout));
    assert_eq!(native.stderr, node.stderr);
    assert_eq!(
        fs::read(helper.scopes.local_path.join(".bitmap")).unwrap(),
        fs::read(node_root.join(".bitmap")).unwrap(),
    );
    let relative = format!("{}/bar/foo/foo.js", helper.scopes.remote);
    assert_eq!(
        fs::read(helper.scopes.local_path.join(&relative)).unwrap(),
        fs::read(node_root.join(&relative)).unwrap(),
    );
}

#[test]
fn a_newer_import_resolves_local_edits_like_node() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.create_component_bar_foo("module.exports = () => 'first';");
    helper.add_component_bar_foo();
    helper.tag_without_build("bar/foo", "");
    crate::helper::remote::publish(&helper);
    let source = helper.clone_workspace();
    helper.re_init_workspace();
    helper.add_remote_scope();
    helper.run(&format!("import {}/bar/foo -x", helper.scopes.remote));
    helper.output_file(
        &format!("{}/bar/foo/foo.js", helper.scopes.remote),
        "module.exports = () => 'local edit';",
    );
    fs::write(source.join("bar/foo.js"), "module.exports = () => 'second';").unwrap();
    let command = "tag bar/foo --message second";
    let run = Helper::cmd_in_with(&source, command, &[("BIT_NATIVE", OsStr::new("off"))]);
    assert!(run.status.success(), "{command}: {}", combined(&run));
    crate::helper::remote::publish_at(&helper, &source);
    let baseline = helper.clone_workspace();
    if let Some(destination) = std::env::var_os("BIT_NATIVE_IMPORT_NEWER_MERGE_FIXTURE") {
        let destination = std::path::PathBuf::from(destination);
        assert!(!destination.exists());
        fs::create_dir_all(&destination).unwrap();
        setup::copy_dir(&helper.scopes.local_path, &destination.join("workspace"));
        setup::copy_dir(&helper.scopes.remote_path, &destination.join("remote"));
    }
    for strategy in ["manual", "ours", "theirs"] {
        helper.get_cloned_workspace(&baseline);
        let node_root = helper.clone_workspace();
        let command = format!("import {}/bar/foo --merge={strategy} -x", helper.scopes.remote);
        let node = Helper::cmd_in_with(&node_root, &command, &[("BIT_NATIVE", OsStr::new("off"))]);
        assert!(node.status.success(), "{strategy}: {}", combined(&node));
        let native = helper.native_run(&command);
        assert!(native.native, "{strategy}: {}", native.trace);
        assert_eq!(native.status.code(), node.status.code(), "{strategy}");
        assert_eq!(
            without_progress_timing(&native.stdout),
            without_progress_timing(&node.stdout),
            "{strategy}",
        );
        assert_eq!(native.stderr, node.stderr, "{strategy}");
        assert_eq!(
            fs::read(helper.scopes.local_path.join(".bitmap")).unwrap(),
            fs::read(node_root.join(".bitmap")).unwrap(),
            "{strategy}",
        );
        let relative = format!("{}/bar/foo/foo.js", helper.scopes.remote);
        assert_eq!(
            fs::read(helper.scopes.local_path.join(&relative)).unwrap(),
            fs::read(node_root.join(&relative)).unwrap(),
            "{strategy}",
        );
    }
}

fn assert_override_import_matches_node(helper: &Helper) {
    let node_root = helper.clone_workspace();
    let command = format!("import {}/bar/foo --override -x", helper.scopes.remote);
    let node = Helper::cmd_in_with(&node_root, &command, &[("BIT_NATIVE", OsStr::new("off"))]);
    assert!(node.status.success(), "{}", combined(&node));
    let native = helper.native_run(&command);
    assert!(native.native, "{}", native.trace);
    assert_eq!(native.status.code(), node.status.code());
    assert_eq!(without_progress_timing(&native.stdout), without_progress_timing(&node.stdout));
    assert_eq!(native.stderr, node.stderr);
    assert_eq!(
        fs::read(helper.scopes.local_path.join(".bitmap")).unwrap(),
        fs::read(node_root.join(".bitmap")).unwrap(),
    );
    let component = format!("{}/bar/foo/foo.js", helper.scopes.remote);
    assert_eq!(
        fs::read(helper.scopes.local_path.join(&component)).unwrap(),
        fs::read(node_root.join(&component)).unwrap(),
    );
}

#[test]
fn files_keep_their_relative_paths() {
    let helper = exported_simple();
    helper.output_file("src/imprel.js", FOO_FIXTURE);
    helper.output_file("src/imprel.spec.js", FOO_FIXTURE);
    helper.output_file("src/utils/myUtil.js", FOO_FIXTURE);
    helper.run("add src -m src/imprel.js -i imprel/imprel");
    helper.tag_without_build("imprel/imprel", "");
    crate::helper::remote::publish(&helper);
    helper.re_init_workspace();
    helper.add_remote_scope();
    let output = import(&helper, "imprel/imprel").native();
    assert!(output.contains("successfully imported one component"), "{output}");
    assert!(output.contains("imprel/imprel"), "{output}");
    let root = helper.scopes.local_path.join(&helper.scopes.remote).join("imprel/imprel");
    for file in ["imprel.js", "imprel.spec.js", "utils/myUtil.js"] {
        assert!(root.join(file).is_file(), "{file}");
    }
}

#[test]
fn a_file_remote_wildcard_import_matches_node() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(3, true, "");
    helper.tag_without_build("", "");
    crate::helper::remote::publish(&helper);
    helper.re_init_workspace();
    helper.add_remote_scope();
    if let Some(destination) = std::env::var_os("BIT_NATIVE_IMPORT_WILDCARD_FIXTURE") {
        let destination = std::path::PathBuf::from(destination);
        assert!(!destination.exists());
        fs::create_dir_all(&destination).unwrap();
        setup::copy_dir(&helper.scopes.local_path, &destination.join("workspace"));
        setup::copy_dir(&helper.scopes.remote_path, &destination.join("remote"));
    }
    let baseline = helper.clone_workspace();
    for flag in ["", "--merge=ours", "--merge=theirs", "--merge=manual", "--override"] {
        helper.get_cloned_workspace(&baseline);
        let node_root = helper.clone_workspace();
        let command = format!("import {}/* -x {flag}", helper.scopes.remote);
        let node = Helper::cmd_in_with(&node_root, &command, &[("BIT_NATIVE", OsStr::new("off"))]);
        assert!(node.status.success(), "{command}: {}", combined(&node));
        let native = helper.native_run(&command);
        assert!(native.native, "{command}: {}", native.trace);
        assert_eq!(native.status.code(), node.status.code(), "{command}");
        assert_eq!(
            without_progress_timing(&native.stdout),
            without_progress_timing(&node.stdout),
            "{command}",
        );
        assert_eq!(native.stderr, node.stderr, "{command}");
        assert_eq!(
            fs::read(helper.scopes.local_path.join(".bitmap")).unwrap(),
            fs::read(node_root.join(".bitmap")).unwrap(),
            "{command}",
        );
        for name in ["comp1", "comp2", "comp3"] {
            let relative = format!("{}/{name}/index.js", helper.scopes.remote);
            assert_eq!(
                fs::read(helper.scopes.local_path.join(&relative)).unwrap(),
                fs::read(node_root.join(&relative)).unwrap(),
                "{command}: {name}",
            );
        }
    }
}

#[test]
fn file_remote_wildcards_filter_and_report_empty_matches_like_node() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(3, true, "");
    helper.tag_without_build("", "");
    crate::helper::remote::publish(&helper);
    helper.re_init_workspace();
    helper.add_remote_scope();
    let baseline = helper.clone_workspace();
    for (pattern, expected) in [("comp[12]*", 2), ("missing*", 0)] {
        helper.get_cloned_workspace(&baseline);
        let node_root = helper.clone_workspace();
        let command = format!("import {}/{pattern} -x", helper.scopes.remote);
        let node = Helper::cmd_in_with(&node_root, &command, &[("BIT_NATIVE", OsStr::new("off"))]);
        assert!(node.status.success(), "{pattern}: {}", combined(&node));
        let native = helper.native_run(&command);
        assert!(native.native, "{pattern}: {}", native.trace);
        assert_eq!(native.status.code(), node.status.code(), "{pattern}");
        assert_eq!(
            without_progress_timing(&native.stdout),
            without_progress_timing(&node.stdout),
            "{pattern}",
        );
        assert_eq!(native.stderr, node.stderr, "{pattern}");
        assert_eq!(
            fs::read(helper.scopes.local_path.join(".bitmap")).unwrap(),
            fs::read(node_root.join(".bitmap")).unwrap(),
            "{pattern}",
        );
        for number in 1..=3 {
            let relative = format!("{}/comp{number}/index.js", helper.scopes.remote);
            let native_file = helper.scopes.local_path.join(&relative);
            let node_file = node_root.join(&relative);
            assert_eq!(native_file.exists(), node_file.exists(), "{pattern}: {relative}");
            assert_eq!(native_file.exists(), number <= expected, "{pattern}: {relative}");
            if native_file.exists() {
                assert_eq!(fs::read(native_file).unwrap(), fs::read(node_file).unwrap());
            }
        }
    }
}

#[test]
fn imported_dependency_traversal_matches_node() {
    let helper = chain();
    helper.re_init_workspace();
    helper.add_remote_scope();
    if let Some(destination) = std::env::var_os("BIT_NATIVE_IMPORT_DEPS_FIXTURE") {
        let destination = std::path::PathBuf::from(destination);
        assert!(!destination.exists());
        fs::create_dir_all(&destination).unwrap();
        setup::copy_dir(&helper.scopes.local_path, &destination.join("workspace"));
        setup::copy_dir(&helper.scopes.remote_path, &destination.join("remote"));
    }
    let baseline = helper.clone_workspace();
    for (root, flags) in [
        ("comp1@0.0.1", "--dependencies --dependencies-depth 1"),
        ("comp1@0.0.1", "--dependencies --dependencies-depth 2"),
        ("comp1@0.0.1", "--dependencies"),
        ("comp1@0.0.1", "--dependencies-head"),
        ("comp1@0.0.1", "--dependencies-head --dependencies-depth 1"),
        ("comp1", "--dependencies --dependencies-depth 1"),
    ] {
        helper.get_cloned_workspace(&baseline);
        let node_root = helper.clone_workspace();
        let command = format!("import {}/{root} {flags} -x", helper.scopes.remote);
        let node = Helper::cmd_in_with(&node_root, &command, &[("BIT_NATIVE", OsStr::new("off"))]);
        assert!(node.status.success(), "{command}: {}", combined(&node));
        let native = helper.native_run(&command);
        assert!(native.native, "{command}: {}", native.trace);
        assert_eq!(native.status.code(), node.status.code(), "{command}");
        assert_eq!(
            without_progress_timing(&native.stdout),
            without_progress_timing(&node.stdout),
            "{command}",
        );
        assert_eq!(native.stderr, node.stderr, "{command}");
        assert_eq!(
            fs::read(helper.scopes.local_path.join(".bitmap")).unwrap(),
            fs::read(node_root.join(".bitmap")).unwrap(),
            "{command}",
        );
        for number in 1..=4 {
            let relative = format!("{}/comp{number}/index.js", helper.scopes.remote);
            let native_file = helper.scopes.local_path.join(&relative);
            let node_file = node_root.join(&relative);
            assert_eq!(native_file.exists(), node_file.exists(), "{command}: {relative}");
            if native_file.exists() {
                assert_eq!(fs::read(native_file).unwrap(), fs::read(node_file).unwrap());
            }
        }
    }
}

#[test]
fn lane_wildcard_selection_matches_node() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.create_component_bar_foo(FOO_FIXTURE);
    helper.add_component_bar_foo();
    helper.tag_without_build("", "");
    crate::helper::remote::publish(&helper);
    helper.re_init_workspace();
    helper.add_remote_scope();
    helper.run("lane create dev");
    helper.populate_components(1, false, "");
    helper.run("snap --message lane");
    crate::helper::remote::publish(&helper);
    std::thread::sleep(std::time::Duration::from_millis(1100));
    if let Some(destination) = std::env::var_os("BIT_NATIVE_IMPORT_LANE_FIXTURE") {
        let destination = std::path::PathBuf::from(destination);
        assert!(!destination.exists());
        fs::create_dir_all(&destination).unwrap();
        setup::copy_dir(&helper.scopes.local_path, &destination.join("workspace"));
        setup::copy_dir(&helper.scopes.remote_path, &destination.join("remote"));
    }
    let baseline = helper.clone_workspace();
    for (pattern, flags) in [("**", "-x"), ("**", "--lane-only -x"), ("comp1", "-x")] {
        helper.get_cloned_workspace(&baseline);
        let node_root = helper.clone_workspace();
        let command = format!("import {}/{pattern} {flags}", helper.scopes.remote);
        let node = Helper::cmd_in_with(&node_root, &command, &[("BIT_NATIVE", OsStr::new("off"))]);
        assert!(node.status.success(), "{command}: {}", combined(&node));
        let native = helper.native_run(&command);
        assert!(native.native, "{command}: {}", native.trace);
        assert_eq!(native.status.code(), node.status.code(), "{command}");
        assert_eq!(
            without_progress_timing(&native.stdout),
            without_progress_timing(&node.stdout),
            "{command}",
        );
        assert_eq!(native.stderr, node.stderr, "{command}");
        assert_eq!(
            fs::read(helper.scopes.local_path.join(".bitmap")).unwrap(),
            fs::read(node_root.join(".bitmap")).unwrap(),
            "{command}",
        );
    }
}

#[test]
fn http_lane_wildcard_import_matches_node() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.create_component_bar_foo(FOO_FIXTURE);
    helper.add_component_bar_foo();
    helper.tag_without_build("", "");
    crate::helper::remote::publish(&helper);
    helper.re_init_workspace();
    helper.add_remote_scope();
    helper.run("lane create dev");
    helper.populate_components(1, false, "");
    helper.run("snap --message lane");
    crate::helper::remote::publish(&helper);

    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let port = listener.local_addr().unwrap().port();
    drop(listener);
    let server = setup::bit_command(setup::shared(), &helper.scopes.remote_path)
        .args([
            "start",
            "--port",
            &port.to_string(),
            "--skip-ui-build",
            "--no-browser",
            "--skip-compilation",
        ])
        .env("BIT_NATIVE", "off")
        .env("CI", "1")
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .unwrap();
    let mut server = ScopeServer(server);
    let ready = (0..300).any(|_| {
        if server.0.try_wait().unwrap().is_some() {
            return false;
        }
        if TcpStream::connect(("127.0.0.1", port)).is_ok() {
            return true;
        }
        thread::sleep(Duration::from_millis(100));
        false
    });
    assert!(ready, "the released CLI did not start its HTTP scope server");
    config::update_scope_json(&helper.scopes.local_path.join(".bit/scope.json"), |scope| {
        scope["remotes"][&helper.scopes.remote] = Value::String(format!("http://127.0.0.1:{port}"));
    });
    let baseline = helper.clone_workspace();
    for flag in ["-x", "--lane-only -x"] {
        helper.get_cloned_workspace(&baseline);
        let node_root = helper.clone_workspace();
        let command = format!("import {}/** {flag}", helper.scopes.remote);
        let node = Helper::cmd_in_with(&node_root, &command, &[("BIT_NATIVE", OsStr::new("off"))]);
        assert!(node.status.success(), "{command}: {}", combined(&node));
        let native = helper.native_run(&command);
        assert!(native.native, "{command}: {}", native.trace);
        assert_eq!(native.status.code(), node.status.code(), "{command}");
        assert_eq!(
            without_progress_timing(&native.stdout),
            without_progress_timing(&node.stdout),
            "{command}",
        );
        assert_eq!(native.stderr, node.stderr, "{command}");
        assert_eq!(
            fs::read(helper.scopes.local_path.join(".bitmap")).unwrap(),
            fs::read(node_root.join(".bitmap")).unwrap(),
            "{command}",
        );
        let relative = format!("{}/bar/foo/foo.js", helper.scopes.remote);
        let native_file = helper.scopes.local_path.join(&relative);
        let node_file = node_root.join(&relative);
        assert_eq!(native_file.exists(), node_file.exists(), "{command}");
        if native_file.exists() {
            assert_eq!(fs::read(native_file).unwrap(), fs::read(node_file).unwrap(), "{command}");
        }
    }
}

#[test]
fn deprecated_lane_component_stays_in_lane_only_wildcard() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.run("lane create dev");
    helper.populate_components(1, false, "");
    helper.run("snap --message first");
    crate::helper::remote::publish(&helper);
    helper.run("deprecate comp1");
    helper.run("snap --message deprecated");
    crate::helper::remote::publish(&helper);
    helper.re_init_workspace();
    helper.add_remote_scope();
    helper.run("lane create dev");
    let node_root = helper.clone_workspace();
    let command = format!("import {}/** --lane-only -x", helper.scopes.remote);
    let node = Helper::cmd_in_with(&node_root, &command, &[("BIT_NATIVE", OsStr::new("off"))]);
    assert!(node.status.success(), "{command}: {}", combined(&node));
    let native = helper.native_run(&command);
    assert!(native.native, "{command}: {}", native.trace);
    assert_eq!(native.status.code(), node.status.code(), "{command}");
    assert_eq!(
        without_progress_timing(&native.stdout),
        without_progress_timing(&node.stdout),
        "{command}",
    );
    assert_eq!(native.stderr, node.stderr, "{command}");
    assert_eq!(
        fs::read(helper.scopes.local_path.join(".bitmap")).unwrap(),
        fs::read(node_root.join(".bitmap")).unwrap(),
        "{command}",
    );
    let bitmap = read_bitmap(&helper);
    let root_dir = bitmap["comp1"]["rootDir"].as_str().expect("imported comp1 directory");
    assert_eq!(
        fs::read(helper.scopes.local_path.join(root_dir).join("index.js")).unwrap(),
        fs::read(node_root.join(root_dir).join("index.js")).unwrap(),
        "{command}",
    );
}

#[test]
fn changed_remote_lane_head_merges_or_declines_like_node() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.create_component_bar_foo(FOO_FIXTURE);
    helper.add_component_bar_foo();
    helper.tag_without_build("", "");
    crate::helper::remote::publish(&helper);
    helper.re_init_workspace();
    helper.add_remote_scope();
    helper.run("lane create dev");
    helper.populate_components(1, false, "");
    helper.run("snap --message first");
    crate::helper::remote::publish(&helper);
    let baseline = helper.clone_workspace();
    helper.append_file("comp1/index.js", "\n// second lane snap");
    helper.run("snap --message second");
    crate::helper::remote::publish(&helper);
    if let Some(destination) = std::env::var_os("BIT_NATIVE_IMPORT_LANE_UPDATE_FIXTURE") {
        let destination = std::path::PathBuf::from(destination);
        assert!(!destination.exists());
        fs::create_dir_all(&destination).unwrap();
        setup::copy_dir(&baseline, &destination.join("workspace"));
        setup::copy_dir(&helper.scopes.remote_path, &destination.join("remote"));
    }
    std::thread::sleep(std::time::Duration::from_millis(1100));
    helper.get_cloned_workspace(&baseline);
    let node_root = helper.clone_workspace();
    let command = format!("import {}/** -x", helper.scopes.remote);
    let node = Helper::cmd_in_with(&node_root, &command, &[("BIT_NATIVE", OsStr::new("off"))]);
    assert!(!node.status.success(), "{command}: {}", combined(&node));
    let native = helper.cmd(&command);
    assert!(!native.native, "{command}: {}", native.trace);
    assert_eq!(native.status.code(), node.status.code());
    assert_eq!(native.stdout, node.stdout);
    assert_eq!(native.stderr, node.stderr);
    assert_eq!(
        fs::read(helper.scopes.local_path.join(".bitmap")).unwrap(),
        fs::read(node_root.join(".bitmap")).unwrap(),
    );
    assert_eq!(
        fs::read(helper.scopes.local_path.join("comp1/index.js")).unwrap(),
        fs::read(node_root.join("comp1/index.js")).unwrap(),
    );
    for (pattern, flag, edited) in [
        ("**", "--merge=ours", false),
        ("**", "--merge=theirs", false),
        ("**", "--merge=manual", false),
        ("**", "--override", false),
        ("**", "--merge=ours", true),
        ("**", "--merge=theirs", true),
        ("**", "--merge=manual", true),
        ("**", "--override", true),
        ("comp1", "--merge=ours", true),
        ("comp1", "--merge=theirs", true),
        ("comp1", "--merge=manual", true),
        ("comp1", "--override", true),
    ] {
        helper.get_cloned_workspace(&baseline);
        if edited {
            helper.append_file("comp1/index.js", "\n// local edit");
        }
        let node_root = helper.clone_workspace();
        let command = format!("import {}/{pattern} -x {flag}", helper.scopes.remote);
        let node = Helper::cmd_in_with(&node_root, &command, &[("BIT_NATIVE", OsStr::new("off"))]);
        assert!(node.status.success(), "{command}: {}", combined(&node));
        let native = helper.native_run(&command);
        assert!(native.native, "{command}: {}", native.trace);
        assert_eq!(native.status.code(), node.status.code(), "{command}");
        assert_eq!(
            without_progress_timing(&native.stdout),
            without_progress_timing(&node.stdout),
            "{command}",
        );
        assert_eq!(native.stderr, node.stderr, "{command}");
        assert_eq!(
            fs::read(helper.scopes.local_path.join(".bitmap")).unwrap(),
            fs::read(node_root.join(".bitmap")).unwrap(),
            "{command}",
        );
        assert_eq!(
            fs::read(helper.scopes.local_path.join("comp1/index.js")).unwrap(),
            fs::read(node_root.join("comp1/index.js")).unwrap(),
            "{command}",
        );
    }
}

#[test]
fn lane_wildcard_imports_missing_lane_component_like_node() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.create_component_bar_foo(FOO_FIXTURE);
    helper.add_component_bar_foo();
    helper.tag_without_build("", "");
    crate::helper::remote::publish(&helper);
    helper.re_init_workspace();
    helper.add_remote_scope();
    helper.run("lane create dev");
    helper.populate_components(1, false, "");
    helper.run("snap --message first");
    crate::helper::remote::publish(&helper);
    helper.re_init_workspace();
    helper.add_remote_scope();
    helper.run("lane create dev");
    std::thread::sleep(std::time::Duration::from_millis(1100));
    let node_root = helper.clone_workspace();
    let command = format!("import {}/** --lane-only -x", helper.scopes.remote);
    let node = Helper::cmd_in_with(&node_root, &command, &[("BIT_NATIVE", OsStr::new("off"))]);
    assert!(node.status.success(), "{command}: {}", combined(&node));
    let native = helper.native_run(&command);
    assert!(native.native, "{command}: {}", native.trace);
    assert_eq!(native.status.code(), node.status.code());
    assert_eq!(without_progress_timing(&native.stdout), without_progress_timing(&node.stdout));
    assert_eq!(native.stderr, node.stderr);
    assert_eq!(
        fs::read_to_string(helper.scopes.local_path.join(".bitmap")).unwrap(),
        fs::read_to_string(node_root.join(".bitmap")).unwrap(),
    );
}

/// Source-suite cases that may still delegate when installation or unsupported
/// component layouts are involved: authored components, some merge layouts,
/// and dependency traversal flags.
mod known_failures {
    use super::{
        chain, combined, consumer_files, expect_id, exported_simple, import, import_chain,
        modified_bar_foo, read_bitmap, set_components_dir, simple_dir,
    };
    use crate::{
        allow_known_failure,
        helper::{FOO_FIXTURE, Helper, len, parse},
        known_failure::Native,
    };

    use std::fs;

    /// stand alone component (without dependencies) › when the default component directory
    /// already exist › when the destination is an existing empty directory › should write the
    /// component to the specified path
    #[test]
    fn an_existing_empty_directory_is_written() {
        let helper = exported_simple();
        fs::create_dir_all(simple_dir(&helper)).unwrap();
        allow_known_failure!(import(&helper, "global/simple"));
        assert!(simple_dir(&helper).join("simple.js").is_file());
    }

    /// stand alone component (without dependencies) › when the default component directory
    /// already exist › when the destination directory is not empty › should not import the
    /// component; should not delete the existing file; should throw an error; should import
    /// successfully if the --override flag is used
    #[test]
    fn a_non_empty_directory_is_not_overwritten() {
        let helper = exported_simple();
        let existing = simple_dir(&helper).join("my-file.js");
        fs::create_dir_all(simple_dir(&helper)).unwrap();
        fs::write(&existing, "console.log()").unwrap();
        let remote = &helper.scopes.remote;
        let run =
            allow_known_failure!(helper.native_or_known(&format!("import {remote}/global/simple")));
        assert!(
            simple_dir(&helper)
                .join("simple.js")
                .symlink_metadata()
                .is_err(),
        );
        assert!(existing.is_file());
        assert!(combined(&run).contains("unable to import"), "{}", combined(&run));
        allow_known_failure!(helper.native_output_or_known(&format!(
            "import {remote}/global/simple --override"
        )));
        assert!(simple_dir(&helper).join("simple.js").is_file());
    }

    /// stand alone component (without dependencies) › when the default component directory
    /// already exist › when the destination is a file › should not import the component;
    /// should not delete the existing file; should throw an error; should throw an error also
    /// when the --override flag is used
    #[test]
    fn a_file_at_the_directory_is_not_overwritten() {
        let helper = exported_simple();
        let dir = simple_dir(&helper);
        fs::create_dir_all(dir.parent().unwrap()).unwrap();
        fs::write(&dir, "console.log()").unwrap();
        let remote = &helper.scopes.remote;
        let run =
            allow_known_failure!(helper.native_or_known(&format!("import {remote}/global/simple")));
        assert!(
            dir.join("simple.js")
                .symlink_metadata()
                .is_err(),
        );
        assert!(dir.is_file());
        assert!(combined(&run).contains("unable to import"), "{}", combined(&run));
        let run = allow_known_failure!(helper.native_or_known(&format!(
            "import {remote}/global/simple --override"
        )));
        assert!(combined(&run).contains("unable to import"), "{}", combined(&run));
    }

    /// stand alone component (without dependencies) › with a specific path, using -p flag › as
    /// imported › when the destination is a non-exist directory › should write the component
    /// to the specified path
    #[test]
    fn the_path_flag_sets_the_directory() {
        let helper = exported_simple();
        let remote = &helper.scopes.remote;
        allow_known_failure!(helper.native_output_or_known(&format!(
            "import {remote}/global/simple -p my-custom-location"
        )));
        assert!(helper.scopes.local_path.join("my-custom-location/simple.js").is_file());
    }

    /// stand alone component (without dependencies) › re-import after deleting the component
    /// physically › should import the component successfully
    #[test]
    fn a_physically_deleted_component_is_imported_again() {
        let helper = exported_simple();
        allow_known_failure!(import(&helper, "global/simple"));
        helper.delete_path("components");
        let output = allow_known_failure!(import(&helper, "global/simple"));
        assert!(output.contains("successfully imported one component"), "{output}");
    }

    /// stand alone component (without dependencies) › import component with custom dsl as
    /// destination dir for import › when the DSL is valid › should import the component
    /// successfully; should import the component into new dir structure according to dsl;
    /// bitmap should contain component with correct rootDir according to dsl
    #[test]
    fn a_valid_default_directory_dsl_places_the_component() {
        let helper = exported_simple();
        set_components_dir(&helper, "{scope}/-{name}-");
        allow_known_failure!(import(&helper, "global/simple"));
        let output = allow_known_failure!(import(&helper, "global/simple"));
        assert!(output.contains("successfully imported one component"), "{output}");
        let remote = &helper.scopes.remote;
        let dir = helper.scopes.local_path.join(remote).join("-global/simple-");
        assert!(
            fs::read_dir(&dir)
                .unwrap()
                .next()
                .is_some(),
            "{dir:?} is empty",
        );
        let root_dir = format!("{remote}/-global/simple-");
        assert_eq!(read_bitmap(&helper)["global/simple"]["rootDir"], root_dir);
    }

    /// stand alone component (without dependencies) › import component with custom dsl as
    /// destination dir for import › when the DSL has invalid parameters › should throw an error
    /// saying it has an invalid parameter
    #[test]
    fn an_invalid_default_directory_dsl_fails() {
        let helper = exported_simple();
        set_components_dir(&helper, "{non-exist-param}/{name}");
        let run = allow_known_failure!(helper.native_or_known(&format!(
            "import {}/global/simple",
            helper.scopes.remote
        )));
        let expected = r#"the "non-exist-param" part of the component structure "{non-exist-param}/{name}" is invalid"#;
        assert!(combined(&run).contains(expected), "{}", combined(&run));
    }

    /// with an existing component in bit.map (as author) › should write the component to the
    /// paths specified in bit.map; should not remove the originallySharedDir (because it is an
    /// AUTHORED component); should not write any file into components directory; importing the
    /// component again › should not create an "undefined" package on `node_modules`
    #[test]
    fn an_authored_component_keeps_its_bitmap_paths() {
        let helper = Helper::new();
        helper.set_workspace_with_remote_scope();
        helper.create_component_bar_foo(FOO_FIXTURE);
        helper.add_component_bar_foo();
        helper.tag_without_build("", "");
        crate::helper::remote::publish(&helper);
        let bitmap = fs::read(helper.scopes.local_path.join(".bitmap")).unwrap();
        helper.re_init_workspace();
        helper.add_remote_scope();
        fs::write(helper.scopes.local_path.join(".bitmap"), bitmap).unwrap();
        allow_known_failure!(import(&helper, "bar/foo"));
        let files = consumer_files(&helper);
        assert!(files.contains(&"bar/foo.js".to_string()), "{files:?}");
        assert!(!files.contains(&"foo.js".to_string()), "{files:?}");
        assert!(
            !files
                .iter()
                .any(|file| file.starts_with("components")),
            "{files:?}",
        );
        allow_known_failure!(import(&helper, "bar/foo"));
        let files = consumer_files(&helper);
        assert!(
            !files
                .iter()
                .any(|file| file.starts_with("node_modules/undefined")),
            "{files:?}",
        );
    }

    /// import a component when the local version is modified › without --override flag › should
    /// display a warning saying it was unable to import; with --override flag › should display a
    /// successful message
    #[test]
    fn a_modified_component_needs_override() {
        let (helper, _clone) = modified_bar_foo();
        let run = allow_known_failure!(helper.native_or_known(&format!(
            "import {}/bar/foo",
            helper.scopes.remote
        )));
        assert!(!run.status.success());
        assert!(combined(&run).contains("unable to import"), "{}", combined(&run));
        let output = allow_known_failure!(import(&helper, "bar/foo --override"));
        assert!(output.contains("successfully imported"), "{output}");
    }

    /// import a component when the local version is modified › with --merge=manual › should
    /// display a successful message
    #[test]
    fn a_modified_component_merges_manually() {
        let (helper, _clone) = modified_bar_foo();
        let output = allow_known_failure!(import(&helper, "bar/foo --merge=manual"));
        assert!(output.contains("successfully imported"), "{output}");
    }

    /// import a component when the local version is modified › re-import a component after
    /// tagging the component › should import successfully
    #[test]
    fn a_tagged_modification_is_imported_again() {
        let (helper, _clone) = modified_bar_foo();
        helper.tag_without_build("", "");
        let output = allow_known_failure!(import(&helper, "bar/foo"));
        assert!(output.contains("successfully imported"), "{output}");
    }

    /// importing a component when it has a local tag › as imported › should not remove the local
    /// version; should not override the local component; importing a specific version › should
    /// not throw an error saying the component was not found
    #[test]
    fn a_local_tag_survives_an_import() {
        let helper = Helper::new();
        helper.set_workspace_with_remote_scope();
        helper.create_component_bar_foo(FOO_FIXTURE);
        helper.add_component_bar_foo();
        helper.tag_without_build("", "");
        crate::helper::remote::publish(&helper);
        helper.re_init_workspace();
        helper.add_remote_scope();
        let remote = helper.scopes.remote.clone();
        helper.run(&format!("import {remote}/bar/foo --path components/bar/foo"));
        helper.output_file("components/bar/foo/foo.js", "v2");
        assert!(helper.tag_without_build("", "").contains("0.0.2"));
        allow_known_failure!(import(&helper, "bar/foo"));
        let cat = parse(&helper.run(&format!("cat-component {remote}/bar/foo --json")));
        assert!(cat["versions"].get("0.0.1").is_some(), "{cat}");
        assert!(cat["versions"].get("0.0.2").is_some(), "{cat}");
        assert!(cat["state"]["versions"].get("0.0.2").is_some(), "{cat}");
        let output = allow_known_failure!(import(&helper, "bar/foo@0.0.1"));
        assert!(output.contains("successfully imported"), "{output}");
    }

    /// import with wildcards › import the entire scope › should import all components from the
    /// remote scope; bit ls should show that all components from the remote scope were imported
    #[test]
    fn a_wildcard_imports_the_whole_scope() {
        let helper = Helper::new();
        helper.set_workspace_with_remote_scope();
        helper.populate_components(3, true, "");
        helper.tag_without_build("", "");
        crate::helper::remote::publish(&helper);
        helper.re_init_workspace();
        helper.add_remote_scope();
        let output = import(&helper, "*").native();
        for comp in ["comp1", "comp2", "comp3"] {
            assert!(output.contains(comp), "{comp} in {output}");
        }
        let list = parse(&helper.native("list --local-scope --json"));
        assert_eq!(len(&list), 3);
    }

    /// import with --dependencies-depth (chain: comp1 -> comp2 -> comp3 -> comp4) ›
    /// --dependencies-depth 1 › should import only the direct dep at the version comp1
    /// references (comp2@0.0.1); --dependencies-depth 2 › should import direct deps and their
    /// direct deps (comp2, comp3) but not deeper
    #[test]
    fn dependencies_depth_limits_the_import() {
        let helper = chain();
        allow_known_failure!(import_chain(
            &helper,
            "comp1@0.0.1",
            "--dependencies --dependencies-depth 1"
        ));
        expect_id(&helper, "comp1", Some("0.0.1"));
        expect_id(&helper, "comp2", Some("0.0.1"));
        expect_id(&helper, "comp3", None);
        expect_id(&helper, "comp4", None);
        allow_known_failure!(import_chain(
            &helper,
            "comp1@0.0.1",
            "--dependencies --dependencies-depth 2"
        ));
        expect_id(&helper, "comp2", Some("0.0.1"));
        expect_id(&helper, "comp3", Some("0.0.1"));
        expect_id(&helper, "comp4", None);
    }

    /// import with --dependencies-depth (chain: comp1 -> comp2 -> comp3 -> comp4) ›
    /// --dependencies-depth with versionless input › should resolve the root to head
    /// (comp1@0.0.2) and import its direct dep at the referenced version (comp2@0.0.2);
    /// --dependencies-head --dependencies-depth 1 › should import the direct dep at head
    /// (comp2@0.0.2), not the version comp1@0.0.1 references
    #[test]
    fn dependencies_depth_resolves_heads() {
        let helper = chain();
        allow_known_failure!(import_chain(
            &helper,
            "comp1",
            "--dependencies --dependencies-depth 1"
        ));
        expect_id(&helper, "comp1", Some("0.0.2"));
        expect_id(&helper, "comp2", Some("0.0.2"));
        expect_id(&helper, "comp3", None);
        allow_known_failure!(import_chain(
            &helper,
            "comp1@0.0.1",
            "--dependencies-head --dependencies-depth 1"
        ));
        expect_id(&helper, "comp1", Some("0.0.1"));
        expect_id(&helper, "comp2", Some("0.0.2"));
        expect_id(&helper, "comp3", None);
        expect_id(&helper, "comp4", None);
    }

    /// import with --dependencies-depth (chain: comp1 -> comp2 -> comp3 -> comp4) ›
    /// --dependencies without depth › should import all transitive dependencies
    #[test]
    fn dependencies_imports_the_whole_chain() {
        let helper = chain();
        allow_known_failure!(import_chain(&helper, "comp1@0.0.1", "--dependencies"));
        for comp in ["comp1", "comp2", "comp3", "comp4"] {
            expect_id(&helper, comp, Some("0.0.1"));
        }
    }

    /// import with --dependencies-depth (chain: comp1 -> comp2 -> comp3 -> comp4) › validation
    /// errors › should error when --dependencies-depth is used without
    /// --dependencies/--dependencies-head; should error when --dependencies-depth is not a
    /// positive integer
    #[test]
    fn dependencies_depth_is_validated() {
        let helper = Helper::new();
        helper.set_workspace_with_remote_scope();
        let remote = &helper.scopes.remote;
        let output = combined(&allow_known_failure!(helper.native_or_known(&format!(
            "import {remote}/comp1 --dependencies-depth 1"
        ))));
        assert!(
            output.contains("--dependencies-depth") && output.contains("--dependencies"),
            "{output}",
        );
        for depth in ["0", "abc", "1.5"] {
            let line = format!("import {remote}/comp1 --dependencies --dependencies-depth {depth}");
            let output = combined(&allow_known_failure!(helper.native_or_known(&line)));
            assert!(output.contains("positive integer"), "{depth}: {output}");
        }
    }
}
