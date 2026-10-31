//! Released `CatCmd` source, config and historical-version presentation.

use crate::helper::{Helper, config, parse, setup};
use serde_json::json;
use std::{
    collections::BTreeSet,
    ffi::OsStr,
    fs,
    io::Write,
    path::{Path, PathBuf},
    process::{Command, Stdio},
};

fn compared(helper: &Helper, command: &str, native_expected: bool) -> String {
    let node_root = helper.clone_workspace();
    rekey_docs_cache(&helper.scopes.local_path, &node_root);
    let node = Helper::cmd_in_with(&node_root, command, &[("BIT_NATIVE", OsStr::new("off"))]);
    let native = if native_expected {
        helper.native_run(command)
    } else {
        Helper::cmd_in_with(
            &helper.scopes.local_path,
            command,
            &[("BIT_NATIVE_QUIET", OsStr::new("1"))],
        )
    };
    assert_eq!(native.native, native_expected, "{}", native.trace);
    assert_eq!(native.status.code(), node.status.code(), "{command}");
    assert_eq!(native.stdout, node.stdout, "{command}");
    assert_eq!(native.stderr, node.stderr, "{command}");
    compare_docs_cache(&helper.scopes.local_path, &node_root);
    native.stdout
}

fn rekey_docs_cache(original: &Path, clone: &Path) {
    let mut files = BTreeSet::new();
    source_files(original, original, &mut files);
    let entries = files
        .into_iter()
        .filter_map(|relative| {
            let source = original.join(&relative);
            let destination = clone.join(&relative);
            fs::File::options()
                .write(true)
                .open(&destination)
                .unwrap()
                .set_times(
                    fs::FileTimes::new()
                        .set_modified(
                            fs::metadata(&source)
                                .unwrap()
                                .modified()
                                .unwrap(),
                        ),
                )
                .unwrap();
            let entry = bit_object_import::read_dependency_cache(
                &original.join(".bit/cache/components/docs"),
                &source_key(original, &source),
            )
            .unwrap()?;
            Some(json!({
                "key":source_key(clone, &destination),
                "data":entry["data"],
                "timestamp":entry["timestamp"],
            }))
        })
        .collect::<Vec<_>>();
    write_cloned_docs_cache(clone, &entries);
}

fn write_cloned_docs_cache(clone: &Path, entries: &[serde_json::Value]) {
    let mut child =
        Command::new(std::env::var_os("BIT_NODE_BINARY").unwrap_or_else(|| "node".into()))
            .args(["-e", include_str!("cat/rekey-docs.cjs")])
            .arg(
                setup::shared().node_cli
                    .parent()
                    .unwrap()
                    .parent()
                    .unwrap(),
            )
            .arg(clone.join(".bit/cache/components/docs"))
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .unwrap();
    child.stdin
        .take()
        .unwrap()
        .write_all(&serde_json::to_vec(entries).unwrap())
        .unwrap();
    let result = child.wait_with_output().unwrap();
    assert!(result.status.success(), "{}", String::from_utf8_lossy(&result.stderr));
}

fn compare_docs_cache(actual: &Path, expected: &Path) {
    let mut files = BTreeSet::new();
    source_files(actual, actual, &mut files);
    source_files(expected, expected, &mut files);
    for relative in files {
        let left = cached_docs(actual, &relative);
        let right = cached_docs(expected, &relative);
        assert_eq!(left, right, "documentation cache for {}", relative.display());
    }
}

fn source_files(root: &Path, directory: &Path, files: &mut BTreeSet<PathBuf>) {
    for entry in fs::read_dir(directory).unwrap().map(Result::unwrap) {
        let path = entry.path();
        let kind = entry.file_type().unwrap();
        if kind.is_dir() && source_directory(&path) {
            source_files(root, &path, files);
        }
        if kind.is_file() && source_extension(&path) {
            files.insert(
                path.strip_prefix(root)
                    .unwrap()
                    .to_owned(),
            );
        }
    }
}

fn source_directory(path: &Path) -> bool {
    let name = path
        .file_name()
        .unwrap()
        .to_string_lossy();
    !name.starts_with('.') && name != "node_modules"
}

fn source_extension(path: &Path) -> bool {
    matches!(path.extension().and_then(OsStr::to_str), Some("js" | "cjs" | "jsx" | "ts" | "tsx"))
}

fn cached_docs(root: &Path, relative: &Path) -> Option<(String, Option<bool>)> {
    let path = root.join(relative);
    let key = source_key(root, &path);
    let cache = root.join(".bit/cache/components/docs");
    let entry = bit_object_import::read_dependency_cache(&cache, &key).unwrap()?;
    let timestamp = entry["timestamp"].as_f64().unwrap();
    let fresh = fs::metadata(path)
        .ok()
        .map(|metadata| {
            let modified = metadata
                .modified()
                .unwrap()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_secs_f64()
                * 1000.0;
            modified <= timestamp
        });
    Some((
        entry["data"]
            .as_str()
            .unwrap()
            .to_owned(),
        fresh,
    ))
}

#[cfg(not(windows))]
fn source_key(_root: &Path, path: &Path) -> String {
    path.to_str().unwrap().to_owned()
}

#[cfg(windows)]
fn source_key(root: &Path, path: &Path) -> String {
    let output = Command::new(std::env::var_os("BIT_NODE_BINARY").unwrap_or_else(|| "node".into()))
        .args(["-e", include_str!("cat/source-key.cjs")])
        .arg(
            setup::shared().node_cli
                .parent()
                .unwrap()
                .parent()
                .unwrap(),
        )
        .arg(root)
        .arg(path)
        .output()
        .unwrap();
    assert!(output.status.success(), "{}", String::from_utf8_lossy(&output.stderr));
    String::from_utf8(output.stdout).unwrap()
}

fn clear_docs_cache(root: &Path) {
    let cache = root.join(".bit/cache/components/docs");
    if cache.exists() {
        fs::remove_dir_all(cache).unwrap();
    }
}

#[test]
fn source_file_config_and_json_views_match_released_cat() {
    let helper = Helper::new();
    helper.re_init_workspace();
    helper.create_component_bar_foo("module.exports = function foo() { return 'v1'; };\n");
    helper.add_component_bar_foo();
    helper.tag_without_build("", "");
    let files = compared(&helper, "cat bar/foo", true);
    assert!(files.contains("--- foo.js ---"));
    assert!(files.contains("return 'v1'"));
    let one = compared(&helper, "cat bar/foo --file foo.js", true);
    assert!(!one.contains("---"));
    assert!(one.contains("return 'v1'"));
    compared(&helper, "cat bar/foo --file nonexistent.js", false);
    let config = compared(&helper, "cat bar/foo --config", true);
    assert!(!config.contains("--- foo.js ---"));
    let all = compared(&helper, "cat bar/foo --all", true);
    assert!(all.contains("--- foo.js ---"));
    let output = compared(&helper, "cat bar/foo --json", true);
    let json = parse(&output);
    assert!(json["id"].is_string());
    assert!(json["version"].is_string());
    assert_eq!(json["files"][0]["path"], "foo.js");
    assert!(json["files"][0]["content"].is_string());
}

#[test]
fn explicit_historical_version_and_default_latest_match_released_cat() {
    let helper = Helper::new();
    helper.re_init_workspace();
    helper.create_component_bar_foo("module.exports = function foo() { return 'v1'; };\n");
    helper.add_component_bar_foo();
    helper.tag_without_build("", "--ver 0.0.1");
    helper.create_component_bar_foo("module.exports = function foo() { return 'v2'; };\n");
    helper.tag_without_build("", "--ver 0.0.2");
    let old = compared(&helper, "cat bar/foo@0.0.1", true);
    assert!(old.contains("return 'v1'"));
    assert!(!old.contains("return 'v2'"));
    let latest = compared(&helper, "cat bar/foo", true);
    assert!(latest.contains("return 'v2'"));
}

#[test]
fn current_workspace_sources_follow_modified_added_and_deleted_files() {
    let helper = Helper::new();
    helper.re_init_workspace();
    helper.create_component_bar_foo("module.exports = 'stored';\n");
    helper.output_file("bar/old.js", "module.exports = 'old';\n");
    helper.run("add bar -i bar/foo --main foo.js");
    helper.tag_without_build("", "");

    helper.create_component_bar_foo("module.exports = 'edited';\n");
    let file = compared(&helper, "cat bar/foo --file foo.js", true);
    assert!(file.contains("edited"));
    assert!(!file.contains("stored"));
    let bitmap = config::read_jsonc(&helper.scopes.local_path.join(".bitmap"));
    let version = bitmap["bar/foo"]["version"].as_str().unwrap();
    let exact = parse(&compared(&helper, &format!("cat bar/foo@{version} --json"), true));
    assert!(
        exact["files"]
            .as_array()
            .unwrap()
            .iter()
            .any(|row| {
                row["path"] == "foo.js"
                    && row["content"]
                        .as_str()
                        .unwrap()
                        .contains("edited")
            }),
    );

    helper.output_file("bar/new.js", "module.exports = 'new';\n");
    let current = parse(&compared(&helper, "cat bar/foo --json", true));
    let files = current["files"].as_array().unwrap();
    assert!(
        files
            .iter()
            .any(|file| {
                file["path"] == "new.js"
                    && file["content"]
                        .as_str()
                        .unwrap()
                        .contains("new")
            }),
    );

    fs::remove_file(helper.scopes.local_path.join("bar/old.js")).unwrap();
    let current = parse(&compared(&helper, "cat bar/foo --json", true));
    assert!(
        !current["files"]
            .as_array()
            .unwrap()
            .iter()
            .any(|file| file["path"] == "old.js"),
    );
    compared(&helper, "cat bar/foo --config", true);
}

#[test]
fn untagged_workspace_component_uses_fresh_sources_and_published_latest_version() {
    let helper = Helper::new();
    helper.re_init_workspace();
    helper.create_component_bar_foo("module.exports = 'untagged';\n");
    helper.add_component_bar_foo();
    let text = compared(&helper, "cat bar/foo", true);
    assert!(text.contains("untagged"));
    let value = parse(&compared(&helper, "cat bar/foo --json", true));
    assert_eq!(value["version"], "latest");
    assert!(
        value["files"][0]["content"]
            .as_str()
            .unwrap()
            .contains("untagged"),
    );
}

#[test]
fn dependency_graph_and_workspace_policy_config_use_released_cat_metadata() {
    let helper = super::move_paths::support::workspace(2, false);
    helper.output_file(
        "comp2/index.js",
        &format!("module.exports=require('@{}/comp1');\n", helper.scopes.remote),
    );
    super::move_paths::support::setup(&helper, "link");
    super::move_paths::support::setup(&helper, "tag --ignore-issues * --message graph");
    let original = parse(&compared(&helper, "cat comp2 --config --json", true));
    assert!(original["config"].is_object());
    config::set_workspace_key(
        &helper.scopes.local_path,
        "teambit.dependencies/dependency-resolver",
        json!({"policy":{"dependencies":{"left-pad":"1.3.0"}}}),
    );
    let current = parse(&compared(&helper, "cat comp2 --config --json", true));
    assert!(current["config"].is_object());
}

#[test]
fn configured_provider_delegates_with_its_published_output_and_effects() {
    let helper = super::move_paths::support::workspace(1, false);
    let source = include_str!("move_paths/provider.cjs");
    helper.output_file("identity-env/index.js", source);
    super::move_paths::support::setup(&helper, "add identity-env -i env/identity");
    config::set_component_env(&helper.scopes.local_path, "env/identity", "teambit.envs/env");
    super::move_paths::support::setup(&helper, "link");
    helper.output_file("identity-env/dist/index.js", source);
    super::move_paths::support::setup(
        &helper,
        "tag env/identity --ignore-issues * --message provider",
    );
    super::move_paths::support::setup(&helper, "tag comp1 --ignore-issues * --message component");
    config::set_workspace_key(
        &helper.scopes.local_path,
        &format!("{}/env/identity", helper.scopes.remote),
        json!({}),
    );
    helper.output_file("identity-provider-active", "active");
    let output = compared(&helper, "cat comp1 --file index.js", false);
    assert_eq!(output.matches("identity provider mutation").count(), 1);
    assert!(helper.scopes.local_path.join("comp1/provider-created.js").is_file());
}

#[test]
fn current_lane_sources_and_historical_main_version_match_released_cat() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.create_component_bar_foo("module.exports = 'main';\n");
    helper.add_component_bar_foo();
    helper.tag_without_build("", "--ver 0.0.1");
    helper.run("export");
    helper.run("lane create dev");
    helper.create_component_bar_foo("module.exports = 'lane';\n");
    helper.run("snap --message lane");
    let current = parse(&compared(&helper, "cat bar/foo --json", true));
    assert!(
        current["files"][0]["content"]
            .as_str()
            .unwrap()
            .contains("lane"),
    );
    let stored = parse(&compared(&helper, "cat bar/foo@0.0.1 --json", true));
    assert!(
        stored["files"][0]["content"]
            .as_str()
            .unwrap()
            .contains("main"),
    );
    compared(&helper, "cat bar/foo --all --json", true);
}

#[test]
fn cold_rich_semantic_docs_and_mixed_cache_hits_match_released_cat() {
    let helper = Helper::new();
    helper.re_init_workspace();
    helper.create_component_bar_foo("/**\n * The public foo.\n * @public\n * @returns {string} greeting\n */\nexport function foo() { return 'hello'; }\n");
    helper.output_file(
        "bar/typed.ts",
        "/**\n * The typed value.\n * @public\n */\nexport const typed: string = 'first';\n",
    );
    helper.output_file("bar/button.jsx", "import React from 'react';\n/** A button component. */\nexport function Button({ label }) { return <button>{label}</button>; }\n");
    helper.output_file("bar/foo.spec.js", "/** A spec-like source. */\nexport const spec = 1;\n");
    helper.run("add bar -i bar/foo --main foo.js");
    clear_docs_cache(&helper.scopes.local_path);
    let first = parse(&compared(&helper, "cat bar/foo --json", true));
    assert_eq!(first["files"].as_array().unwrap().len(), 4);
    assert!(cached_docs(&helper.scopes.local_path, Path::new("bar/foo.js")).is_some());
    assert!(cached_docs(&helper.scopes.local_path, Path::new("bar/typed.ts")).is_some());
    assert!(cached_docs(&helper.scopes.local_path, Path::new("bar/button.jsx")).is_some());
    assert!(cached_docs(&helper.scopes.local_path, Path::new("bar/foo.spec.js")).is_some());
    let foo_docs = cached_docs(&helper.scopes.local_path, Path::new("bar/foo.js")).unwrap().0;
    assert!(
        !parse(&foo_docs)
            .as_array()
            .unwrap()
            .is_empty(),
    );

    helper.output_file(
        "bar/typed.ts",
        "/**\n * Updated typed value.\n * @public\n */\nexport const typed: string = 'second';\n",
    );
    fs::File::options()
        .write(true)
        .open(helper.scopes.local_path.join("bar/typed.ts"))
        .unwrap()
        .set_times(
            fs::FileTimes::new()
                // The published parser stamps a rewritten cache entry with Date.now().
                // Keep this source newer than both sequential oracle runs so its
                // post-write cache validity is deterministic on slow CI hosts.
                .set_modified(std::time::SystemTime::now() + std::time::Duration::from_hours(24)),
        )
        .unwrap();
    let mixed = parse(&compared(&helper, "cat bar/foo --json", true));
    assert!(
        mixed["files"]
            .as_array()
            .unwrap()
            .iter()
            .any(|file| {
                file["path"] == "typed.ts"
                    && file["content"]
                        .as_str()
                        .unwrap()
                        .contains("second")
            }),
    );
}

#[test]
fn no_fs_cache_feature_uses_published_cat_semantics_without_cache_writes() {
    let helper = Helper::new();
    helper.re_init_workspace();
    helper.create_component_bar_foo("/** No cache. */\nexport const foo = 1;\n");
    helper.add_component_bar_foo();
    clear_docs_cache(&helper.scopes.local_path);
    let node_root = helper.clone_workspace();
    let command = "cat bar/foo --json";
    let node = Helper::cmd_in_with(
        &node_root,
        command,
        &[("BIT_NATIVE", OsStr::new("off")), ("BIT_FEATURES", OsStr::new("no-fs-cache"))],
    );
    let native = Helper::cmd_in_with(
        &helper.scopes.local_path,
        command,
        &[("BIT_FEATURES", OsStr::new("no-fs-cache"))],
    );
    assert!(native.native, "{}", native.trace);
    assert_eq!(native.status.code(), node.status.code());
    assert_eq!(native.stdout, node.stdout);
    assert_eq!(native.stderr, node.stderr);
    assert_eq!(cached_docs(&helper.scopes.local_path, Path::new("bar/foo.js")), None);
    assert_eq!(cached_docs(&node_root, Path::new("bar/foo.js")), None);
}

#[cfg(unix)]
#[test]
fn cold_docs_cache_write_failure_remains_nonfatal() {
    use std::os::unix::fs::PermissionsExt;
    let helper = Helper::new();
    helper.re_init_workspace();
    helper.create_component_bar_foo("/** This cache write must fail. */\nexport const foo = 1;\n");
    helper.add_component_bar_foo();
    let cache = helper.scopes.local_path.join(".bit/cache/components/docs");
    if cache.exists() {
        fs::remove_dir_all(&cache).unwrap();
    }
    fs::create_dir_all(&cache).unwrap();
    let node_root = helper.clone_workspace();
    let node_cache = node_root.join(".bit/cache/components/docs");
    for path in [&cache, &node_cache] {
        fs::set_permissions(path, fs::Permissions::from_mode(0o500)).unwrap();
        assert_eq!(
            fs::write(path.join("probe"), "blocked").unwrap_err().kind(),
            std::io::ErrorKind::PermissionDenied,
        );
    }
    let command = "cat bar/foo --json";
    let node = Helper::cmd_in_with(&node_root, command, &[("BIT_NATIVE", OsStr::new("off"))]);
    let native = helper.native_run(command);
    for path in [&cache, &node_cache] {
        fs::set_permissions(path, fs::Permissions::from_mode(0o700)).unwrap();
    }
    assert!(native.native, "{}", native.trace);
    assert!(native.status.success());
    assert_eq!(native.status.code(), node.status.code());
    assert_eq!(native.stdout, node.stdout);
    assert_eq!(native.stderr, node.stderr);
    assert!(parse(&native.stdout)["files"].is_array());
    assert_eq!(cached_docs(&helper.scopes.local_path, Path::new("bar/foo.js")), None);
    assert_eq!(cached_docs(&node_root, Path::new("bar/foo.js")), None);
}

#[test]
fn missing_file_delegates_before_cold_semantics_and_keeps_published_cache_effects() {
    let helper = Helper::new();
    helper.re_init_workspace();
    helper.create_component_bar_foo(
        "/**\n * Public foo.\n * @public\n */\nexport function foo() { return 1; }\n",
    );
    helper.add_component_bar_foo();
    let cache = helper.scopes.local_path.join(".bit/cache/components/docs");
    if cache.exists() {
        fs::remove_dir_all(cache).unwrap();
    }
    compared(&helper, "cat bar/foo --file absent.js --json", false);
    assert!(cached_docs(&helper.scopes.local_path, Path::new("bar/foo.js")).is_some());
}

#[test]
fn released_loader_rejects_missing_main_before_any_documentation_cache_write() {
    let helper = Helper::new();
    helper.re_init_workspace();
    helper.create_component_bar_foo(
        "/**\n * Public foo.\n * @public\n */\nexport function foo() { return 1; }\n",
    );
    helper.output_file("bar/z.js", "export const main = 2;\n");
    helper.run("add bar -i bar/foo --main z.js");
    clear_docs_cache(&helper.scopes.local_path);
    fs::remove_file(helper.scopes.local_path.join("bar/z.js")).unwrap();
    compared(&helper, "cat bar/foo --json", false);
    assert_eq!(cached_docs(&helper.scopes.local_path, Path::new("bar/foo.js")), None);
}
