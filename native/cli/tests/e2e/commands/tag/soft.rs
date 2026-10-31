//! `tag --soft` followed by `tag --persist=skip-build` on a real workspace.

use crate::helper::{FOO_FIXTURE, Helper, config, parse};
use std::{ffi::OsStr, path::Path};

pub(super) fn bitmap(root: &Path) -> serde_json::Value {
    config::read_jsonc(&root.join(".bitmap"))
}

pub(super) fn compare_command(helper: &Helper, node_workspace: &Path, command: &str) {
    let native = helper.native_run(command);
    let node = Helper::cmd_in_with(node_workspace, command, &[("BIT_NATIVE", OsStr::new("off"))]);
    assert!(!node.native, "{}", node.trace);
    assert_eq!(
        native.status.code(),
        node.status.code(),
        "native stdout: {}\nnative stderr: {}\nnode stdout: {}\nnode stderr: {}",
        native.stdout,
        native.stderr,
        node.stdout,
        node.stderr,
    );
    assert_eq!(native.stderr, node.stderr);
    assert_eq!(native.stdout, node.stdout);
    assert_eq!(bitmap(&helper.scopes.local_path), bitmap(node_workspace));
}

#[test]
fn soft_tag_then_persist_matches_node() {
    let helper = Helper::new();
    helper.re_init_workspace_with(false);
    helper.create_component_bar_foo(FOO_FIXTURE);
    helper.add_component_bar_foo();
    helper.native("link");
    let node_workspace = helper.clone_workspace();

    compare_command(&helper, &node_workspace, "tag --soft bar/foo --message probe");
    let pending = bitmap(&helper.scopes.local_path);
    assert_eq!(pending["bar/foo"]["nextVersion"]["version"], "patch");
    assert_eq!(pending["bar/foo"]["version"], "");
    let native_status = parse(&helper.native("status --json"));
    let node_status =
        Helper::cmd_in_with(&node_workspace, "status --json", &[("BIT_NATIVE", OsStr::new("off"))]);
    assert_eq!(native_status, parse(&node_status.stdout));
    assert_eq!(native_status["softTaggedComponents"][0], "my-scope/bar/foo");

    compare_command(&helper, &node_workspace, "tag --persist=skip-build");
    let persisted = bitmap(&helper.scopes.local_path);
    assert!(persisted["bar/foo"].get("nextVersion").is_none());
    assert_eq!(persisted["bar/foo"]["version"], "0.0.1");

    let native_status = parse(&helper.native("status --json"));
    let node_status =
        Helper::cmd_in_with(&node_workspace, "status --json", &[("BIT_NATIVE", OsStr::new("off"))]);
    assert_eq!(native_status, parse(&node_status.stdout));
}

#[test]
fn soft_prerelease_persist_preserves_node_rejection() {
    let helper = Helper::new();
    helper.re_init_workspace_with(false);
    helper.create_component_bar_foo(FOO_FIXTURE);
    helper.add_component_bar_foo();
    helper.native("link");
    let node_workspace = helper.clone_workspace();

    compare_command(
        &helper,
        &node_workspace,
        "tag --soft bar/foo --increment preminor --prerelease-id beta --message preview",
    );
    let pending = bitmap(&helper.scopes.local_path);
    assert_eq!(pending["bar/foo"]["nextVersion"]["version"], "preminor");
    assert_eq!(pending["bar/foo"]["nextVersion"]["preRelease"], "beta");

    let native = Helper::cmd_in_with(&helper.scopes.local_path, "tag --persist=skip-build", &[]);
    let node = Helper::cmd_in_with(
        &node_workspace,
        "tag --persist=skip-build",
        &[("BIT_NATIVE", OsStr::new("off"))],
    );
    assert!(!native.native, "{}", native.trace);
    assert!(!node.status.success());
    assert_eq!(native.status.code(), node.status.code());
    assert_eq!(native.stderr, node.stderr);
    assert_eq!(bitmap(&helper.scopes.local_path), bitmap(&node_workspace));
}

#[test]
fn repeated_soft_tag_replaces_pending_version_and_message() {
    let helper = Helper::new();
    helper.re_init_workspace_with(false);
    helper.create_component_bar_foo(FOO_FIXTURE);
    helper.add_component_bar_foo();
    helper.native("link");
    let node_workspace = helper.clone_workspace();

    compare_command(&helper, &node_workspace, "tag --soft bar/foo --message first");
    compare_command(&helper, &node_workspace, "tag --soft bar/foo --minor --message second");
    let pending = bitmap(&helper.scopes.local_path);
    assert_eq!(pending["bar/foo"]["nextVersion"]["version"], "minor");
    assert_eq!(pending["bar/foo"]["nextVersion"]["message"], "second");
    compare_command(&helper, &node_workspace, "tag --persist=skip-build");
    assert_eq!(bitmap(&helper.scopes.local_path)["bar/foo"]["version"], "0.1.0");
}

#[test]
fn exact_soft_tag_then_persist_matches_node() {
    let helper = Helper::new();
    helper.re_init_workspace_with(false);
    helper.create_component_bar_foo(FOO_FIXTURE);
    helper.add_component_bar_foo();
    helper.native("link");
    let node_workspace = helper.clone_workspace();

    compare_command(&helper, &node_workspace, "tag --soft bar/foo --ver 2.4.0 --message planned");
    assert_eq!(bitmap(&helper.scopes.local_path)["bar/foo"]["nextVersion"]["version"], "2.4.0");
    compare_command(&helper, &node_workspace, "tag --persist=skip-build");
    assert_eq!(bitmap(&helper.scopes.local_path)["bar/foo"]["version"], "2.4.0");
}

#[test]
fn versions_file_explicit_and_default_apply_to_dependents() {
    let helper = Helper::new();
    helper.re_init_workspace_with(false);
    helper.populate_components(2, true, "");
    helper.native("tag --message initial");
    helper.append_file("comp2/index.js", "\n// changed dependency");
    std::fs::write(
        helper.scopes.local_path.join("versions.txt"),
        "my-scope/comp2: 2.3.0-beta.1\nDEFAULT: minor\n",
    )
    .unwrap();
    let node_workspace = helper.clone_workspace();
    compare_command(
        &helper,
        &node_workspace,
        "tag comp2 --versions-file versions.txt --message versions",
    );
    let actual = bitmap(&helper.scopes.local_path);
    assert_eq!(actual["comp2"]["version"], "2.3.0-beta.1");
    assert_eq!(actual["comp1"]["version"], "0.1.0");
}

#[test]
fn modified_state_selector_preserves_automatic_dependents() {
    let helper = Helper::new();
    helper.re_init_workspace_with(false);
    helper.populate_components(2, true, "");
    helper.native("tag --message initial");
    helper.append_file("comp2/index.js", "\n// changed dependency");
    let node_workspace = helper.clone_workspace();
    compare_command(&helper, &node_workspace, r#"tag "$modified AND comp*" --message modified"#);
    let actual = bitmap(&helper.scopes.local_path);
    assert_eq!(actual["comp2"]["version"], "0.0.2");
    assert_eq!(actual["comp1"]["version"], "0.0.2");
}

#[test]
fn soft_versions_file_then_persist_matches_node() {
    let helper = Helper::new();
    helper.re_init_workspace_with(false);
    helper.create_component_bar_foo(FOO_FIXTURE);
    helper.add_component_bar_foo();
    helper.native("link");
    std::fs::write(helper.scopes.local_path.join("versions.txt"), "DEFAULT: 3.2.1\n").unwrap();
    let node_workspace = helper.clone_workspace();
    compare_command(
        &helper,
        &node_workspace,
        "tag bar/foo --soft --versions-file versions.txt --message planned",
    );
    compare_command(&helper, &node_workspace, "tag --persist=skip-build");
    assert_eq!(bitmap(&helper.scopes.local_path)["bar/foo"]["version"], "3.2.1");
}

#[test]
fn dependency_graph_policy_flags_match_node() {
    let helper = Helper::new();
    helper.re_init_workspace_with(false);
    helper.populate_components(2, true, "");
    helper.native("tag --message initial");
    helper.append_file("comp2/index.js", "\n// graph rebuilt");
    let node_workspace = helper.clone_workspace();
    compare_command(
        &helper,
        &node_workspace,
        "tag --rebuild-deps-graph --no-lock-deps --message graph",
    );
    let native = parse(&helper.native("cat-component comp1@latest --json"));
    let node = Helper::cmd_in_with(
        &node_workspace,
        "cat-component comp1@latest --json",
        &[("BIT_NATIVE", OsStr::new("off"))],
    );
    let node = parse(&node.stdout);
    assert!(native.get("dependenciesGraphRef").is_none());
    assert_eq!(native["flattenedDependencies"], node["flattenedDependencies"]);
}

#[test]
fn ignore_newest_version_allows_tagging_an_old_checkout() {
    let helper = Helper::new();
    helper.re_init_workspace_with(false);
    helper.create_component_bar_foo(FOO_FIXTURE);
    helper.add_component_bar_foo();
    helper.native("tag --message first");
    helper.append_file("bar/foo.js", "\n// second");
    helper.native("tag --message second");
    helper.native("checkout 0.0.1 bar/foo -x");
    helper.append_file("bar/foo.js", "\n// hotfix");
    let node_workspace = helper.clone_workspace();
    compare_command(
        &helper,
        &node_workspace,
        "tag bar/foo --ignore-newest-version --message hotfix",
    );
    assert_eq!(bitmap(&helper.scopes.local_path)["bar/foo"]["version"], "0.0.3");
}

#[test]
fn ignored_missing_package_issue_matches_node() {
    let helper = Helper::new();
    helper.re_init_workspace_with(false);
    helper.create_component_bar_foo("require('missing-snapshot-fixture-package');\n");
    helper.add_component_bar_foo();
    helper.native("link");
    let node_workspace = helper.clone_workspace();
    compare_command(
        &helper,
        &node_workspace,
        "tag bar/foo -i MissingPackagesDependenciesOnFs --message ignored",
    );
    assert_eq!(bitmap(&helper.scopes.local_path)["bar/foo"]["version"], "0.0.1");
}

#[test]
fn numeric_increment_by_matches_node() {
    let helper = Helper::new();
    helper.re_init_workspace_with(false);
    helper.create_component_bar_foo(FOO_FIXTURE);
    helper.add_component_bar_foo();
    helper.native("tag --message initial");
    for (count, expected) in [("1.5", "0.0.3"), ("0", "0.0.4"), ("1e1", "0.0.14")] {
        helper.append_file("bar/foo.js", &format!("\n// increment {count}"));
        let node_workspace = helper.clone_workspace();
        compare_command(
            &helper,
            &node_workspace,
            &format!("tag --increment-by {count} --message numeric"),
        );
        assert_eq!(bitmap(&helper.scopes.local_path)["bar/foo"]["version"], expected);
    }
}

#[cfg(unix)]
#[test]
fn soft_editor_messages_survive_persist_per_component() {
    use std::os::unix::fs::PermissionsExt;
    let helper = Helper::new();
    helper.re_init_workspace_with(false);
    helper.populate_components(2, true, "");
    helper.output_file(
        "bin/vim",
        r"#!/usr/bin/env node
const fs=require('fs'); const file=process.argv.at(-1);
let text=fs.readFileSync(file,'utf8');
text=text.replace(/^my-scope\/comp1:.*$/m,'my-scope/comp1: first component message');
text=text.replace(/^my-scope\/comp2:.*$/m,'my-scope/comp2: second component message');
fs.writeFileSync(file,text);
",
    );
    let executable = helper.scopes.local_path.join("bin/vim");
    std::fs::set_permissions(executable, std::fs::Permissions::from_mode(0o755)).unwrap();
    let paths = std::env::join_paths(
        std::iter::once(helper.scopes.local_path.join("bin"))
            .chain(std::env::split_paths(&std::env::var_os("PATH").unwrap())),
    )
    .unwrap();
    let node_workspace = helper.clone_workspace();
    let command = "tag --soft --editor vim";
    let native =
        Helper::cmd_in_with(&helper.scopes.local_path, command, &[("PATH", paths.as_os_str())]);
    let node = Helper::cmd_in_with(
        &node_workspace,
        command,
        &[("BIT_NATIVE", OsStr::new("off")), ("PATH", paths.as_os_str())],
    );
    assert!(native.native, "{}", native.trace);
    assert_eq!(native.status.code(), node.status.code(), "{} {}", native.stderr, node.stderr);
    assert_eq!(native.stdout, node.stdout);
    assert_eq!(native.stderr, node.stderr);
    assert_eq!(bitmap(&helper.scopes.local_path), bitmap(&node_workspace));
    assert_eq!(
        bitmap(&helper.scopes.local_path)["comp1"]["nextVersion"]["message"],
        "first component message",
    );
    compare_command(&helper, &node_workspace, "tag --persist=skip-build");
    for id in ["comp1", "comp2"] {
        let command = format!("cat-component {id}@latest --json");
        let native = parse(&helper.native(&command));
        let node =
            Helper::cmd_in_with(&node_workspace, &command, &[("BIT_NATIVE", OsStr::new("off"))]);
        assert_eq!(native["log"]["message"], parse(&node.stdout)["log"]["message"]);
    }
}
