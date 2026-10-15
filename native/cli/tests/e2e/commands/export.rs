//! `e2e/commands/export.e2e.ts`.

use crate::helper::{Helper, config, parse, setup};
use std::{ffi::OsStr, fs, path::Path};

fn object_names(scope: &Path) -> Vec<String> {
    let mut names = Vec::new();
    for prefix in fs::read_dir(scope.join("objects")).unwrap() {
        let prefix = prefix.unwrap();
        for object in fs::read_dir(prefix.path()).unwrap() {
            let object = object.unwrap();
            names.push(format!(
                "{}/{}",
                prefix.file_name().to_string_lossy(),
                object.file_name().to_string_lossy(),
            ));
        }
    }
    names.sort();
    names
}

#[test]
fn cross_scope_forked_lane_export_matches_node() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    let fork_scope = format!("{}-fork", helper.scopes.remote);
    let fork_remote = helper.scopes.e2e_dir.join(&fork_scope);
    fs::create_dir_all(&fork_remote).unwrap();
    let init =
        Helper::cmd_in_with(&fork_remote, "init --bare", &[("BIT_NATIVE", OsStr::new("off"))]);
    assert!(init.status.success(), "{}", init.stderr);
    config::update_scope_json(&fork_remote.join("scope.json"), |scope| {
        scope["remotes"][&helper.scopes.remote] =
            serde_json::json!(format!("file://{}", helper.scopes.remote_path.display()));
    });
    config::update_scope_json(&helper.scopes.local_path.join(".bit/scope.json"), |scope| {
        scope["remotes"][&fork_scope] =
            serde_json::json!(format!("file://{}", fork_remote.display()));
    });
    helper.populate_components(2, true, "");
    helper.run("tag");
    helper.run("export");
    helper.run("lane create parent");
    helper.run("snap --unmodified --message parent");
    helper.run("export");
    helper.run(&format!("lane create child --scope {fork_scope} --fork-lane-new-scope"));
    helper.run("snap comp1 --unmodified --message child");
    if let Some(destination) = std::env::var_os("BIT_NATIVE_EXPORT_BENCH_FIXTURE") {
        let destination = std::path::PathBuf::from(destination);
        assert!(!destination.exists());
        fs::create_dir_all(&destination).unwrap();
        setup::copy_dir(&helper.scopes.local_path, &destination.join("workspace"));
        setup::copy_dir(&helper.scopes.remote_path, &destination.join("parent-remote"));
        setup::copy_dir(&fork_remote, &destination.join("fork-remote"));
    }
    let remote_before = helper.clone_remote_at(&fork_remote);
    let node_root = helper.clone_workspace();
    let node_ci_root = helper.clone_workspace();
    let rust_ci_root = helper.clone_workspace();
    let node_ci = Helper::cmd_in_with(
        &node_ci_root,
        "export --fork-lane-new-scope",
        &[("BIT_NATIVE", OsStr::new("off")), ("CI", OsStr::new("1"))],
    );
    assert!(node_ci.status.success(), "{}", node_ci.stderr);
    Helper::restore_remote_at(&fork_remote, &remote_before);
    let rust_ci = Helper::cmd_in_with(
        &rust_ci_root,
        "export --fork-lane-new-scope",
        &[("CI", OsStr::new("1"))],
    );
    assert!(rust_ci.native, "{}", rust_ci.trace);
    assert_eq!(rust_ci.status.code(), node_ci.status.code());
    assert_eq!(rust_ci.stdout, node_ci.stdout);
    assert_eq!(rust_ci.stderr, node_ci.stderr);
    Helper::restore_remote_at(&fork_remote, &remote_before);
    let node = Helper::cmd_in_with(
        &node_root,
        "export --fork-lane-new-scope",
        &[("BIT_NATIVE", OsStr::new("off"))],
    );
    assert!(node.status.success(), "{}", node.stderr);
    let node_remote = helper.clone_remote_at(&fork_remote);
    Helper::restore_remote_at(&fork_remote, &remote_before);
    let native = helper.native_run("export --fork-lane-new-scope");
    assert_eq!(native.stdout, node.stdout);
    assert_eq!(native.stderr, node.stderr);
    assert_eq!(
        parse(&fs::read_to_string(fork_remote.join("index.json")).unwrap()),
        parse(&fs::read_to_string(node_remote.join("index.json")).unwrap()),
    );
    assert_eq!(object_names(&fork_remote), object_names(&node_remote));
    for path in [
        ".bitmap".to_owned(),
        ".bit/scope.json".to_owned(),
        ".bit/index.json".to_owned(),
        format!(".bit/refs/remotes/{fork_scope}/child"),
    ] {
        let native_bytes = fs::read_to_string(helper.scopes.local_path.join(&path)).unwrap();
        let node_bytes = fs::read_to_string(node_root.join(&path)).unwrap();
        let native_json = if path == ".bitmap" {
            parse(&native_bytes[native_bytes.find('{').unwrap()..])
        } else {
            parse(&native_bytes)
        };
        let node_json = if path == ".bitmap" {
            parse(&node_bytes[node_bytes.find('{').unwrap()..])
        } else {
            parse(&node_bytes)
        };
        assert_eq!(native_json, node_json, "{path}");
    }
    let node_status = Helper::cmd_in_with(
        &node_root,
        "status --json --lanes",
        &[("BIT_NATIVE", OsStr::new("off"))],
    );
    let native_status = helper.native_run("status --json --lanes");
    assert_eq!(parse(&native_status.stdout), parse(&node_status.stdout));
    let remote_before_repeat = helper.clone_remote_at(&fork_remote);
    let node_repeat = Helper::cmd_in_with(
        &node_root,
        "export --fork-lane-new-scope",
        &[("BIT_NATIVE", OsStr::new("off"))],
    );
    Helper::restore_remote_at(&fork_remote, &remote_before_repeat);
    let native_repeat = helper.native_run("export --fork-lane-new-scope");
    assert_eq!(native_repeat.status.code(), node_repeat.status.code());
    assert_eq!(native_repeat.stdout, node_repeat.stdout);
    assert_eq!(native_repeat.stderr, node_repeat.stderr);
}

#[test]
fn forked_lane_export_matches_node() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.create_component_bar_foo("module.exports = () => 'foo';");
    helper.add_component_bar_foo();
    helper.run("tag bar/foo --message base");
    helper.run("export");
    helper.run("lane create parent");
    helper.run("snap --unmodified --message parent");
    helper.run("export");
    helper.run("lane create child");
    helper.run("snap --unmodified --message child");
    let remote_before = helper.clone_remote_scope();
    let node_root = helper.clone_workspace();
    let node = Helper::cmd_in_with(&node_root, "export", &[("BIT_NATIVE", OsStr::new("off"))]);
    assert!(node.status.success(), "{}", node.stderr);
    let node_refs =
        fs::read(node_root.join(format!(".bit/refs/remotes/{}/child", helper.scopes.remote)))
            .unwrap();
    helper.restore_remote_scope(&remote_before);
    let native = helper.native_run("export");
    assert_eq!(native.stdout, node.stdout);
    assert_eq!(native.stderr, node.stderr);
    let native_refs = fs::read(helper.scopes.local_path.join(format!(
        ".bit/refs/remotes/{}/child",
        helper.scopes.remote,
    )))
    .unwrap();
    assert_eq!(native_refs, node_refs);
    let node_status = Helper::cmd_in_with(
        &node_root,
        "status --json --lanes",
        &[("BIT_NATIVE", OsStr::new("off"))],
    );
    let native_status = helper.native_run("status --json --lanes");
    assert_eq!(parse(&native_status.stdout), parse(&node_status.stdout));
}

#[test]
fn deleted_lane_component_export_matches_node() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.create_component_bar_foo("module.exports = () => 'foo';");
    helper.add_component_bar_foo();
    helper.run("tag bar/foo --message base");
    helper.run("export");
    helper.run("lane create dev");
    helper.run("snap --unmodified --message lane");
    helper.run("export");
    helper.run("delete bar/foo --silent --lane");
    helper.run("snap --unmodified --message removal");
    let remote_before = helper.clone_remote_scope();
    let node_root = helper.clone_workspace();
    let node = Helper::cmd_in_with(&node_root, "export", &[("BIT_NATIVE", OsStr::new("off"))]);
    assert!(node.status.success(), "{}", node.stderr);
    let node_refs =
        fs::read(node_root.join(format!(".bit/refs/remotes/{}/dev", helper.scopes.remote)))
            .unwrap();
    helper.restore_remote_scope(&remote_before);
    let native = helper.native_run("export");
    assert_eq!(native.stdout, node.stdout);
    assert_eq!(native.stderr, node.stderr);
    let native_refs = fs::read(helper.scopes.local_path.join(format!(
        ".bit/refs/remotes/{}/dev",
        helper.scopes.remote,
    )))
    .unwrap();
    assert_eq!(native_refs, node_refs);
    let node_status =
        Helper::cmd_in_with(&node_root, "status --json", &[("BIT_NATIVE", OsStr::new("off"))]);
    let native_status = helper.native_run("status --json");
    assert_eq!(parse(&native_status.stdout), parse(&node_status.stdout));
}

#[test]
fn fresh_lane_component_export_matches_node() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.create_component_bar_foo("module.exports = () => 'foo';");
    helper.add_component_bar_foo();
    helper.run("lane create dev");
    helper.run("snap --message first");
    let remote_before = helper.clone_remote_scope();
    let node_root = helper.clone_workspace();
    let node = Helper::cmd_in_with(&node_root, "export", &[("BIT_NATIVE", OsStr::new("off"))]);
    assert!(node.status.success(), "{}", node.stderr);
    let node_remote = helper.clone_remote_scope();
    helper.restore_remote_scope(&remote_before);
    let native = helper.native_run("export");
    assert_eq!(native.stdout, node.stdout);
    assert_eq!(native.stderr, node.stderr);
    assert_eq!(
        parse(&fs::read_to_string(helper.scopes.remote_path.join("index.json")).unwrap()),
        parse(&fs::read_to_string(node_remote.join("index.json")).unwrap()),
    );
    for path in [
        ".bitmap".to_owned(),
        ".bit/scope.json".to_owned(),
        ".bit/index.json".to_owned(),
        format!(".bit/refs/remotes/{}/dev", helper.scopes.remote),
    ] {
        let native_bytes = fs::read_to_string(helper.scopes.local_path.join(&path)).unwrap();
        let node_bytes = fs::read_to_string(node_root.join(&path)).unwrap();
        let native_json = if path == ".bitmap" {
            parse(&native_bytes[native_bytes.find('{').unwrap()..])
        } else {
            parse(&native_bytes)
        };
        let node_json = if path == ".bitmap" {
            parse(&node_bytes[node_bytes.find('{').unwrap()..])
        } else {
            parse(&node_bytes)
        };
        assert_eq!(native_json, node_json, "{path}");
    }
    let node_status =
        Helper::cmd_in_with(&node_root, "status --json", &[("BIT_NATIVE", OsStr::new("off"))]);
    let native_status = helper.native_run("status --json");
    assert_eq!(parse(&native_status.stdout), parse(&node_status.stdout));
    assert!(
        parse(&native_status.stdout)["stagedComponents"]
            .as_array()
            .unwrap()
            .is_empty(),
    );
}

#[test]
fn hidden_lane_update_dependent_exports_like_node() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(2, true, "");
    helper.run("tag");
    helper.run("export");
    helper.run("lane create dev");
    helper.run("snap comp2 --skip-auto-snap --unmodified --message lane");
    helper.run("export");
    helper.seed_hidden_update_dependent(
        &format!("{}/comp1", helper.scopes.remote),
        &format!("{}/dev", helper.scopes.remote),
    );
    helper.re_init_workspace();
    helper.add_remote_scope();
    helper.run(&format!("lane import {}/dev -x", helper.scopes.remote));
    helper.run(&format!("import {}/comp2 -x", helper.scopes.remote));
    helper.output_file(
        &format!("{}/comp2/index.js", helper.scopes.remote),
        "module.exports = () => 'comp2-v2';",
    );
    helper.run("snap --message update");
    let remote_before = helper.clone_remote_scope();
    let node_root = helper.clone_workspace();
    let node = Helper::cmd_in_with(&node_root, "export", &[("BIT_NATIVE", OsStr::new("off"))]);
    assert!(node.status.success(), "{}", node.stderr);
    let remote_ref = format!("refs/remotes/{}/dev", helper.scopes.remote);
    let node_refs = parse(&fs::read_to_string(node_root.join(".bit").join(&remote_ref)).unwrap());
    helper.restore_remote_scope(&remote_before);
    let native = helper.native_run("export");
    assert_eq!(native.stdout, node.stdout, "{native:?}");
    assert_eq!(native.stderr, node.stderr);
    let native_refs =
        parse(&fs::read_to_string(helper.scopes.local_path.join(".bit").join(remote_ref)).unwrap());
    assert_eq!(native_refs, node_refs);
    assert_eq!(
        fs::read(
            helper.scopes.local_path
                .join(".bit/refs/remotes")
                .join(&helper.scopes.remote)
                .join("dev")
        )
        .unwrap(),
        fs::read(
            node_root
                .join(".bit/refs/remotes")
                .join(&helper.scopes.remote)
                .join("dev")
        )
        .unwrap(),
    );
    let node_status =
        Helper::cmd_in_with(&node_root, "status --json", &[("BIT_NATIVE", OsStr::new("off"))]);
    let native_status = helper.native_run("status --json");
    assert_eq!(parse(&native_status.stdout), parse(&node_status.stdout));
    let node_repeat =
        Helper::cmd_in_with(&node_root, "export", &[("BIT_NATIVE", OsStr::new("off"))]);
    let native_repeat = helper.native_run("export");
    assert_eq!(native_repeat.stdout, node_repeat.stdout);
    assert_eq!(native_repeat.stderr, node_repeat.stderr);
}

/// export a component when the checked out version is not the latest › .bitmap should keep
/// the current version and do not update to the latest version; bit show should display the
/// component with the current version, not the latest; the file content should not be
/// changed
#[test]
fn exporting_an_older_checked_out_version_keeps_it() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.create_component_bar_foo("// v2");
    helper.add_component_bar_foo();
    helper.run("tag --unmodified --ver 2.0.0");
    helper.native("export");
    helper.create_component_bar_foo("// v1");
    helper.run("tag --unmodified --ver 1.0.0");
    helper.native("export");
    let bitmap = fs::read_to_string(helper.scopes.local_path.join(".bitmap")).unwrap();
    let bitmap = parse(&bitmap[bitmap.find('{').unwrap()..]);
    assert_eq!(bitmap["bar/foo"]["version"], "1.0.0");
    let show = helper.run("show bar/foo");
    assert!(show.contains("1.0.0") && !show.contains("2.0.0"), "{show}");
    let content = fs::read_to_string(helper.scopes.local_path.join("bar/foo.js")).unwrap();
    assert_eq!(content, "// v1");
}

/// An exported `comp1` whose remote was created again.
fn exported_to_a_recreated_remote() -> Helper {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, true, "");
    helper.tag_without_build("", "");
    helper.run("export");
    helper.re_init_remote_scope();
    helper
}

/// export after re-creating the remote › export without any flag › should show a message
/// that nothing to export
#[test]
fn a_recreated_remote_has_nothing_to_export() {
    let output = exported_to_a_recreated_remote().native("export");
    assert!(output.contains("nothing to export"), "{output}");
}

/// Native `bit export` declines an empty workspace (`commandOutboundPrepare: No such file or
/// directory`), `export <ids>` (`outbound requested component is not staged`), `--all`,
/// `--all-versions` and a remote init with `--shared` (`outbound file remote group ownership
/// requires canonical export`); native `bit import` declines the e2e workspace (`status
/// configured extensions require Harmony`).
mod known_failures {
    use super::exported_to_a_recreated_remote;
    use crate::{
        allow_known_failure,
        helper::{FOO_FIXTURE, Helper, len, parse},
        known_failure::KnownResult,
    };
    use std::fs;

    /// `exportIds(ids)`, natively: something must be exported.
    fn export_ids(helper: &Helper, ids: &str) -> KnownResult<String> {
        let output = helper.native_output_or_known(&format!("export {ids}"))?;
        assert!(!output.contains("nothing to export"), "{output}");
        Ok(output)
    }

    /// A tagged `bar/foo` in a workspace with a remote scope.
    fn tagged_bar_foo() -> Helper {
        let helper = Helper::new();
        helper.set_workspace_with_remote_scope();
        helper.create_component_bar_foo(FOO_FIXTURE);
        helper.add_component_bar_foo();
        helper.tag_component_bar_foo();
        helper
    }

    /// with no components to export › should print nothing to export
    #[test]
    fn nothing_to_export() {
        let helper = Helper::new();
        helper.set_workspace_with_remote_scope();
        let output = allow_known_failure!(helper.native_output_or_known("export"));
        assert!(output.contains("nothing to export"), "{output}");
    }

    /// with multiple versions › should export it with no errors
    #[test]
    fn multiple_versions_are_exported() {
        let helper = tagged_bar_foo();
        allow_known_failure!(export_ids(&helper, "bar/foo"));
        helper.tag_without_build("bar/foo", "--unmodified");
        allow_known_failure!(export_ids(&helper, "bar/foo"));
        let output = helper.run(&format!("list {}", helper.scopes.remote));
        assert!(output.contains("found 1 components"), "{output}");
        assert!(output.contains("bar/foo"), "{output}");
        assert!(output.contains('2'), "{output}");
    }

    /// imported (v1), exported (v2) and then exported again (v3) › should export it with no
    /// errors
    #[test]
    fn an_imported_component_is_exported_twice() {
        let helper = tagged_bar_foo();
        helper.run("export bar/foo");
        helper.re_init_workspace();
        helper.add_remote_scope();
        let remote = &helper.scopes.remote;
        helper.run(&format!("import {remote}/bar/foo --path components/bar/foo"));
        helper.output_file("components/bar/foo/foo.js", r#"console.log("got foo v2")"#);
        helper.tag_component_bar_foo();
        allow_known_failure!(export_ids(&helper, "bar/foo"));
        helper.output_file("components/bar/foo/foo.js", r#"console.log("got foo v3")"#);
        helper.tag_component_bar_foo();
        allow_known_failure!(export_ids(&helper, "bar/foo"));
        let output = helper.run(&format!("list {remote} --ids"));
        assert!(output.contains(&format!("{remote}/bar/foo@0.0.3")), "{output}");
    }

    /// with a PNG file › should export it with no errors; after importing the file › the
    /// size of the binary file should not be changed
    #[test]
    fn a_png_file_keeps_its_size() {
        let helper = Helper::new();
        helper.set_workspace_with_remote_scope();
        helper.create_component_bar_foo(FOO_FIXTURE);
        let source = concat!(env!("CARGO_MANIFEST_DIR"), "/../../e2e/fixtures/png_fixture.png");
        let png = helper.scopes.local_path.join("bar/png_fixture.png");
        fs::copy(source, &png).unwrap();
        let size = fs::metadata(&png).unwrap().len();
        helper.run("add bar -m foo.js -i bar/foo");
        helper.tag_without_build("", "");
        helper.native("export");
        let remote = &helper.scopes.remote;
        let output = helper.run(&format!("list {remote}"));
        assert!(output.contains("found 1 components"), "{output}");
        assert!(output.contains("bar/foo"), "{output}");
        let import = format!("import {remote}/bar/foo");
        allow_known_failure!(helper.native_output_or_known(&import));
        assert_eq!(fs::metadata(&png).unwrap().len(), size);
    }

    /// export a component, do not modify it and export again to the same scope › should not
    /// export the component
    #[test]
    fn an_unmodified_component_is_not_exported_again() {
        let helper = tagged_bar_foo();
        helper.run("export bar/foo");
        let output = allow_known_failure!(helper.native_output_or_known("export bar/foo"));
        assert!(output.contains("nothing to export"), "{output}");
    }

    /// `bit init --bare --shared <group>` as the remote scope.
    #[cfg(unix)]
    fn shared_remote(helper: &Helper, group: &str) {
        let remote = &helper.scopes.remote_path;
        let _ = fs::remove_dir_all(remote);
        fs::create_dir_all(remote).unwrap();
        let run = Helper::cmd_in(remote, &format!("init --bare --shared {group}"));
        assert!(run.status.success(), "{}", run.stderr);
        helper.add_remote_scope();
    }

    /// A tagged `bar/foo` whose remote was init with `--shared <group>`.
    #[cfg(unix)]
    fn tagged_for_shared_remote(group: &str) -> Helper {
        let helper = Helper::new();
        helper.re_init_workspace();
        shared_remote(&helper, "nonExistGroup");
        helper.create_component_bar_foo(FOO_FIXTURE);
        helper.add_component_bar_foo();
        helper.tag_without_build("", "");
        shared_remote(&helper, group);
        helper
    }

    /// applying permissions on the remote scope when was init with shared flag › when the
    /// group name does not exist › should throw an error indicating that the group does not
    /// exist (unless it is Windows)
    #[cfg(unix)]
    #[test]
    fn a_missing_shared_group_fails_the_export() {
        let helper = tagged_for_shared_remote("nonExistGroup");
        let run = allow_known_failure!(helper.native_or_known("export"));
        let output = format!("{}{}", run.stdout, run.stderr);
        assert!(output.contains(r#"unable to resolve group id of "nonExistGroup""#), "{output}");
    }

    /// applying permissions on the remote scope when was init with shared flag › when the
    /// group exists and the current user has permission to that group › should export the
    /// component successfully and change the owner to that group
    #[cfg(unix)]
    #[test]
    fn an_existing_shared_group_owns_the_export() {
        let group = std::process::Command::new("id")
            .arg("-gn")
            .output()
            .unwrap();
        let group = String::from_utf8(group.stdout).unwrap();
        let helper = tagged_for_shared_remote(group.trim());
        let output = allow_known_failure!(helper.native_output_or_known("export"));
        assert!(output.contains("exported components (1)"), "{output}");
    }

    fn exports_all_with(flag: &str) {
        let helper = exported_to_a_recreated_remote();
        let remote = &helper.scopes.remote;
        let export = format!("export {remote} {remote}/* {flag}");
        allow_known_failure!(helper.native_output_or_known(&export));
        let list = parse(&helper.run(&format!("list {remote} --json")));
        assert_eq!(len(&list), 1);
    }

    /// export after re-creating the remote › export with --all flag › should export them
    /// successfully
    #[test]
    fn all_exports_to_a_recreated_remote() {
        exports_all_with("--all");
    }

    /// export after re-creating the remote › export with --all-versions flag › should export
    /// them successfully
    #[test]
    fn all_versions_exports_to_a_recreated_remote() {
        exports_all_with("--all-versions");
    }

    /// re-export using the component name without the scope name › should not show the
    /// "fork" prompt
    #[test]
    fn reexporting_by_name_without_scope() {
        let helper = Helper::new();
        helper.set_workspace_with_remote_scope();
        helper.create_component_bar_foo(FOO_FIXTURE);
        helper.add_component_bar_foo();
        helper.tag_without_build("", "");
        helper.run("export");
        helper.tag_without_build("bar/foo", "--unmodified");
        helper.run("export");
        helper.tag_without_build("bar/foo", "--unmodified");
        let output = allow_known_failure!(export_ids(&helper, "bar/foo"));
        assert!(output.contains("exported components (1)"), "{output}");
    }
}
