//! Cases from `e2e/harmony/dependencies-cmd.e2e.ts`, `e2e/harmony/deps-write.e2e.ts`,
//! and `e2e/harmony/diff-component-peer.e2e.ts`.

use crate::{
    helper::{Helper, config, parse},
    known_failure::KnownResult,
};
use serde_json::json;
use std::{ffi::OsStr, fs};

const DEP_RESOLVER: &str = "teambit.dependencies/dependency-resolver";

#[test]
fn bit_deps_diagnose_package_matches_node() -> KnownResult<()> {
    let helper = Helper::new();
    helper.re_init_workspace();
    let store = helper.scopes.local_path.join("node_modules/.pnpm");
    fs::create_dir_all(store.join("foo@1.0.0")).unwrap();
    fs::create_dir_all(store.join("foo@2.0.0_react@18.0.0")).unwrap();
    fs::create_dir_all(store.join("@scope+bar@3.0.0")).unwrap();
    for command in [
        "deps diagnose --package foo",
        "deps diagnose --package @scope/bar",
        "deps diagnose --package missing",
    ] {
        let node = Helper::cmd_in_with(
            &helper.scopes.local_path,
            command,
            &[("BIT_NATIVE", OsStr::new("off"))],
        );
        let native = helper.native_run(command);
        assert!(
            node.status.success(),
            "{}: stdout={} stderr={}",
            command,
            node.stdout,
            node.stderr,
        );
        assert!(native.status.success(), "{}: {}", command, native.stderr);
        assert_eq!(native.stdout, node.stdout, "{command}");
    }
    Ok(())
}

#[test]
fn bit_deps_diagnose_report_matches_node() -> KnownResult<()> {
    let helper = Helper::new();
    helper.re_init_workspace();
    helper.populate_components(2, true, "");
    helper.native("deps set comp1 foo@1.0.0");
    helper.native("deps set comp2 foo@2.0.0");
    helper.native("deps set comp1 bar@1.0.0 --peer");
    helper.native("deps set comp2 bar@2.0.0 --peer");
    let store = helper.scopes.local_path.join("node_modules/.pnpm");
    fs::create_dir_all(store.join("foo@1.0.0")).unwrap();
    fs::create_dir_all(store.join("foo@2.0.0")).unwrap();
    fs::create_dir_all(store.join("bar@1.0.0")).unwrap();
    fs::create_dir_all(store.join("bar@2.0.0")).unwrap();
    let node = Helper::cmd_in_with(
        &helper.scopes.local_path,
        "deps diagnose",
        &[("BIT_NATIVE", OsStr::new("off"))],
    );
    let native = helper.native_run("deps diagnose");
    assert!(node.status.success(), "{}", node.stderr);
    assert!(native.status.success(), "{}", native.stderr);
    assert_eq!(native.stdout, node.stdout);
    let node_color = Helper::cmd_in_with(
        &helper.scopes.local_path,
        "deps diagnose",
        &[("BIT_NATIVE", OsStr::new("off")), ("FORCE_COLOR", OsStr::new("1"))],
    );
    let native_color = Helper::cmd_in_with(
        &helper.scopes.local_path,
        "deps diagnose",
        &[("BIT_NATIVE", OsStr::new("on")), ("FORCE_COLOR", OsStr::new("1"))],
    );
    assert!(node_color.status.success(), "{}", node_color.stderr);
    assert!(native_color.status.success(), "{}", native_color.stderr);
    assert!(native_color.native, "{}", native_color.trace);
    assert_eq!(native_color.stdout, node_color.stdout);
    let origins = Helper::cmd_in_with(
        &helper.scopes.local_path,
        "deps diagnose --origins",
        &[("BIT_NATIVE", OsStr::new("off"))],
    );
    let native_origins = helper.native_run("deps diagnose --origins");
    assert!(origins.status.success(), "{}", origins.stderr);
    assert!(native_origins.status.success(), "{}", native_origins.stderr);
    assert_eq!(native_origins.stdout, origins.stdout);
    let node_origins_color = Helper::cmd_in_with(
        &helper.scopes.local_path,
        "deps diagnose --origins",
        &[("BIT_NATIVE", OsStr::new("off")), ("FORCE_COLOR", OsStr::new("1"))],
    );
    let native_origins_color = Helper::cmd_in_with(
        &helper.scopes.local_path,
        "deps diagnose --origins",
        &[("BIT_NATIVE", OsStr::new("on")), ("FORCE_COLOR", OsStr::new("1"))],
    );
    assert!(node_origins_color.status.success(), "{}", node_origins_color.stderr);
    assert!(native_origins_color.status.success(), "{}", native_origins_color.stderr);
    assert!(native_origins_color.native, "{}", native_origins_color.trace);
    assert_eq!(native_origins_color.stdout, node_origins_color.stdout);
    Ok(())
}

#[test]
fn bit_deps_diagnose_empty_workspace_matches_node() -> KnownResult<()> {
    let helper = Helper::new();
    helper.re_init_workspace();
    fs::create_dir_all(helper.scopes.local_path.join("node_modules/.pnpm")).unwrap();
    for command in ["deps diagnose", "deps diagnose --origins"] {
        let node = Helper::cmd_in_with(
            &helper.scopes.local_path,
            command,
            &[("BIT_NATIVE", OsStr::new("off"))],
        );
        let native = helper.native_run(command);
        assert!(node.status.success(), "{}", node.stderr);
        assert!(native.status.success(), "{}", native.stderr);
        assert_eq!(native.stdout, node.stdout);
    }
    Ok(())
}

#[test]
fn bit_deps_get_new_component() -> KnownResult<()> {
    let helper = Helper::new();
    helper.re_init_workspace();
    helper.populate_components(1, true, "");

    // should not throw an error saying the id is missing from the graph
    let out = helper.native("deps get comp1");
    assert!(!out.is_empty());
    Ok(())
}

#[test]
fn bit_deps_set_prod_and_dev_and_eject() -> KnownResult<()> {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(3, true, "");
    helper.native("deps set comp1 lodash@3.3.1");

    // bit show should show the newly added dep
    let show = helper.native("show comp1");
    assert!(show.contains("lodash@3.3.1"), "{show}");

    // bit status should not show a package with a version set in the config as a pinned dependency
    helper.expect_status_to_not_have_issue("PinnedDependencies");

    // adding another dep as a devDep
    helper.native("deps set comp1 some-pkg@1.1.1 --dev");
    let show_config = helper.show_aspect_config("comp1", DEP_RESOLVER);

    // should save the dev in the devDependencies
    let deps = show_config["data"]["dependencies"].as_array().unwrap();
    let some_pkg = deps
        .iter()
        .find(|dep| dep["id"].as_str() == Some("some-pkg"))
        .expect("some-pkg should exist");
    assert_eq!(some_pkg["lifecycle"].as_str(), Some("dev"));

    // should not remove the dep that was added before
    let lodash = deps
        .iter()
        .find(|dep| dep["id"].as_str() == Some("lodash"));
    assert!(lodash.is_some());

    // ejecting config and changing a dependency
    helper.native("eject-conf comp1");
    helper.native("deps set comp1 some-pkg@1.1.2 --dev");
    let show_config_after = helper.show_aspect_config("comp1", DEP_RESOLVER);
    let deps_after = show_config_after["data"]["dependencies"].as_array().unwrap();

    // should not remove the dep that was added before
    let lodash_after = deps_after
        .iter()
        .find(|dep| dep["id"].as_str() == Some("lodash"));
    assert!(lodash_after.is_some());
    Ok(())
}

#[test]
fn bit_deps_set_multiple_and_remove_and_scoped() -> KnownResult<()> {
    let helper = Helper::new();
    helper.re_init_workspace();
    helper.populate_components(1, true, "");
    helper.native("deps set comp1 lodash@3.3.1 ramda@0.0.27");

    // should set them all
    let show_config = helper.show_aspect_config("comp1", DEP_RESOLVER);
    let deps = show_config["data"]["dependencies"].as_array().unwrap();
    let ramda = deps
        .iter()
        .find(|dep| dep["id"].as_str() == Some("ramda"))
        .unwrap();
    assert_eq!(ramda["version"].as_str(), Some("0.0.27"));
    let lodash = deps
        .iter()
        .find(|dep| dep["id"].as_str() == Some("lodash"))
        .unwrap();
    assert_eq!(lodash["version"].as_str(), Some("3.3.1"));

    // removing them with and without version -> should remove them all
    helper.native("deps remove comp1 lodash@3.3.1 ramda");
    let show_after = helper.show_aspect_config("comp1", DEP_RESOLVER);
    let deps_after = show_after["data"]["dependencies"].as_array().unwrap();
    assert!(
        deps_after
            .iter()
            .all(|dep| dep["id"].as_str() != Some("ramda")),
    );
    assert!(
        deps_after
            .iter()
            .all(|dep| dep["id"].as_str() != Some("lodash")),
    );

    // adding scoped package -> should set it correctly
    helper.re_init_workspace();
    helper.populate_components(1, true, "");
    helper.native("deps set comp1 @scoped/button@3.3.1");
    let show = helper.native("show comp1");
    assert!(show.contains("@scoped/button@3.3.1"), "{show}");

    // adding prod dep, tagging then adding devDep -> should not remove the previously added dependencies
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, true, "");
    helper.native("deps set comp1 lodash@3.3.1");
    helper.native("tag --skip-tests");
    helper.native("deps set comp1 ramda@0.0.20 --dev");
    let show_tagged = helper.run("show comp1");
    assert!(show_tagged.contains("lodash"), "{show_tagged}");

    // adding itself as a dep -> should ignore it and not consider it as a dependency
    helper.re_init_workspace();
    helper.populate_components(1, true, "");
    helper.native("tag --skip-tests");
    let pkg_name = format!("@{}/comp1", helper.scopes.remote);
    helper.native(&format!("deps set comp1 {pkg_name}@0.0.1"));
    let dep_ids = helper.get_comp_deps_ids_from_data("comp1");
    assert!(!dep_ids.contains(&format!("{}/comp1@0.0.1", helper.scopes.remote)));
    Ok(())
}

#[test]
fn bit_deps_set_old_version_of_workspace_component() -> KnownResult<()> {
    let helper = Helper::new();
    helper.re_init_workspace();
    helper.populate_components(2, true, "");
    helper.native("tag --skip-tests");
    let comp2_pkg = format!("@{}/comp2", helper.scopes.remote);
    helper.native(&format!("deps set comp1 {comp2_pkg}@0.0.1"));
    helper.native("tag --skip-tests --unmodified");

    // should keep the version from the config when tagging the dependency with it
    let comp1 = parse(&helper.cat_component("comp1@latest"));
    assert_eq!(comp1["dependencies"][0]["id"]["version"].as_str(), Some("0.0.1"));
    assert_eq!(
        helper.status_json()["modifiedComponents"]
            .as_array()
            .unwrap()
            .len(),
        0,
    );

    // bit status should show the version set by the config as an issue that does not block the tag
    helper.expect_status_to_have_issue("PinnedDependencies");

    // tagging the dependency
    let tag_output = helper.tag_Without_Build_id("comp2", "--unmodified");

    // should not auto-tag the dependent
    assert!(tag_output.contains("1 component(s) tagged"), "{tag_output}");
    assert_eq!(
        helper.status_json()["modifiedComponents"]
            .as_array()
            .unwrap()
            .len(),
        0,
    );

    // should show the dependent that was not auto-tagged and the version it keeps
    assert!(tag_output.contains("dependents not auto-tagged"), "{tag_output}");
    assert!(tag_output.contains(&format!("{}/comp1", helper.scopes.remote)), "{tag_output}");
    Ok(())
}

#[test]
fn bit_deps_set_component_dependency_not_installed_locally() -> KnownResult<()> {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, false, "");
    helper.create_component_bar_foo("");
    helper.add_component_bar_foo();
    helper.compile();
    helper.native("tag --skip-tests");
    helper.native("export");

    helper.re_init_workspace();
    let mut ws = helper.read_workspace_jsonc();
    ws.as_object_mut()
        .unwrap()
        .remove("teambit.component/issues");
    helper.write_workspace_jsonc(&ws);
    helper.add_remote_scope();
    helper.import_component("comp1", "");
    let bar_pkg = format!("@{}/bar.foo", helper.scopes.remote);
    helper.native(&format!("deps set comp1 {bar_pkg}@0.0.1"));

    // bit status should show it as missing
    helper.expect_status_to_have_issue("MissingManuallyConfiguredPackages");

    // bit install should fix it
    helper.native(&format!("import {}/bar/foo --objects", helper.scopes.remote));
    helper.npm_add_fake_package(&bar_pkg, "0.0.1", true);
    helper.expect_status_to_not_have_issues();

    // should recognize it as a component after the installation
    let deps = helper.native("deps get comp1");
    assert!(deps.contains("bar/foo@0.0.1"), "{deps}");
    Ok(())
}

#[test]
fn bit_deps_remove_and_unset_and_usage() -> KnownResult<()> {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.add_default_scope("my-scope");
    helper.populate_components(2, true, "");
    let before_remove = helper.clone_workspace();

    // should support component-id syntax
    let out = helper.native("deps remove comp1 comp2");
    assert!(!out.contains("nothing to remove"), "{out}");
    let show_config = helper.show_aspect_config("comp1", DEP_RESOLVER);
    assert_eq!(show_config["config"]["policy"]["dependencies"], json!({ "@my-scope/comp2": "-" }));

    // should support package-name syntax
    helper.get_cloned_workspace(&before_remove);
    helper.native("deps remove comp1 @my-scope/comp2");
    let show_config_pkg = helper.show_aspect_config("comp1", DEP_RESOLVER);
    assert_eq!(
        show_config_pkg["config"]["policy"]["dependencies"],
        json!({ "@my-scope/comp2": "-" }),
    );

    // bit deps remove - when other deps were set previously before tag
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, true, "");
    helper.native("deps set comp1 ramda@0.20.0 lodash@3.3.1");
    helper.native("tag --skip-tests");
    // should remove only the dependency specified and leave the rest
    helper.native("deps remove comp1 ramda");
    let show_after_rm = helper.show_aspect_config("comp1", DEP_RESOLVER);
    assert_eq!(show_after_rm["config"]["policy"]["dependencies"], json!({ "lodash": "3.3.1" }));

    // bit deps unset: one dep was specifically set and one dep was auto-detected
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, true, "");
    helper.write_file("comp1/index.js", "import lodash from 'lodash';");
    helper.npm_add_fake_package("lodash", "3.3.1", false);
    helper.native("deps set comp1 ramda@0.20.0");
    helper.native("tag --skip-tests");

    // unset the auto-detected -> should not remove the dependency
    helper.native("deps unset comp1 lodash");
    let deps_1 = helper.show_component_parsed_harmony_by_title("comp1", "dependencies");
    let ids_1: Vec<&str> = deps_1
        .as_array()
        .unwrap()
        .iter()
        .filter_map(|dep| dep["id"].as_str())
        .collect();
    assert!(ids_1.contains(&"lodash"));
    assert!(ids_1.contains(&"ramda"));

    // unset the previously deps-set -> should remove the dependency
    helper.native("deps unset comp1 ramda");
    let deps_2 = helper.show_component_parsed_harmony_by_title("comp1", "dependencies");
    let ids_2: Vec<&str> = deps_2
        .as_array()
        .unwrap()
        .iter()
        .filter_map(|dep| dep["id"].as_str())
        .collect();
    assert!(!ids_2.contains(&"ramda"));
    assert!(ids_2.contains(&"lodash"));

    // bit deps usage -> should return paths to subdependency
    helper.re_init_workspace();
    helper.native("install is-odd@3.0.1");
    let usage = helper.native("deps usage is-number");
    assert!(usage.contains("is-number@6.0.0"), "{usage}");
    Ok(())
}

#[test]
fn deps_write_and_import_write_deps() -> KnownResult<()> {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, true, "");
    let mut ws = helper.read_workspace_jsonc();
    ws[DEP_RESOLVER]["rootComponents"] = json!(true);
    ws[DEP_RESOLVER]["policy"] = json!({
        "dependencies": {
            "is-odd": "1.0.0"
        }
    });
    helper.write_workspace_jsonc(&ws);
    helper.output_file("comp1/index.js", r#"const React = require("react"); require("is-odd");"#);
    helper.native("install --add-missing-deps");
    helper.native("tag --skip-tests");
    helper.native("export");

    // using deps write command
    helper.re_init_workspace();
    helper.add_remote_scope();
    helper.run(&format!("import {}/comp1@latest", helper.scopes.remote));
    helper.native("deps write");
    helper.native("deps write --target=package.json");

    // should add dependencies to workspace.jsonc
    let ws_after = helper.read_workspace_jsonc();
    assert_eq!(ws_after[DEP_RESOLVER]["policy"]["dependencies"]["is-odd"].as_str(), Some("1.0.0"));

    // should add dependencies to package.json
    let pkg_json = config::read_jsonc(&helper.scopes.local_path.join("package.json"));
    assert_eq!(pkg_json["dependencies"]["is-odd"].as_str(), Some("1.0.0"));

    // using import command
    helper.re_init_workspace();
    helper.add_remote_scope();
    helper.run(&format!("import {}/comp1@latest --write-deps=package.json", helper.scopes.remote));

    // should add dependencies to package.json
    let pkg_json_2 = config::read_jsonc(&helper.scopes.local_path.join("package.json"));
    assert_eq!(pkg_json_2["dependencies"]["is-odd"].as_str(), Some("1.0.0"));
    Ok(())
}

#[test]
fn diff_with_component_level_peer_dependency() -> KnownResult<()> {
    let helper = Helper::new();
    helper.re_init_workspace();
    helper.populate_components(2, true, "");
    helper.native("set-peer comp2 0");
    helper.native("install");
    helper.native("tag --skip-tests");

    // bit status should not show the component as modified
    let status = helper.status_json();
    let modified = status["modifiedComponents"].as_array().unwrap();
    assert!(
        !modified
            .iter()
            .any(|msg| msg
                .as_str()
                .is_some_and(|s| s.contains("comp1"))),
    );

    // bit diff should not show a phantom peer-dependency change
    let diff = helper.diff("comp1");
    assert!(!diff.contains("peerDependencies"), "{diff}");
    Ok(())
}
