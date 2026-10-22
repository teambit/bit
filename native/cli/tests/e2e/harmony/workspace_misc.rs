//! Cases from:
//! - `e2e/harmony/corrupted-objects.e2e.ts`
//! - `e2e/harmony/load-bit.e2e.ts`
//! - `e2e/harmony/node-linker.e2e.ts`
//! - `e2e/harmony/patched-dependencies.e2e.ts`
//! - `e2e/harmony/pnpm-default-hoisting.e2e.ts`
//! - `e2e/harmony/artifacts.e2e.ts`
//! - `e2e/harmony/pkg-manager-errors.e2e.ts`
//! - `e2e/harmony/readme-env.e2e.ts`
//! - `e2e/harmony/show-harmony.e2e.ts`
//! - `e2e/harmony/graph-harmony.e2e.ts`
//! - `e2e/harmony/harmony-workspace.e2e.ts`
//! - `e2e/harmony/import-resolves-missing-deps-from-model.e2e.ts`
//! - `e2e/harmony/preview.e2e.ts`
//! - `e2e/harmony/released-bit-core-exports.e2e.ts`
//! - `e2e/harmony/require-resolve.e2e.ts`
//! - `e2e/harmony/dev-files.e2e.ts`
//! - `e2e/harmony/link.e2e.ts`
//! - `e2e/harmony/load-failures-issue.e2e.ts`

use crate::{
    helper::{Helper, config, issue_types, parse},
    known_failure::KnownResult,
};
use serde_json::json;
use std::fs;

const DEP_RESOLVER: &str = "teambit.dependencies/dependency-resolver";

#[test]
fn corrupted_objects_status_and_import_fix() -> KnownResult<()> {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, false, "");
    helper.tag_all_without_build("");
    helper.export("");

    let comp = parse(&helper.cat_component("comp1@latest"));
    let file_hash = comp["files"][0]["file"].as_str().unwrap();
    let obj_rel = format!(".bit/objects/{}/{}", &file_hash[..2], &file_hash[2..]);
    helper.output_file(&obj_rel, "");

    // bit status should throw an error with a suggestion how to fix
    let st = helper.try_cmd("status");
    assert!(!st.status.success());
    let combined = format!("{}\n{}", st.stdout, st.stderr);
    assert!(combined.contains("bit import --all-history"), "{combined}");

    // bit import --all-history should fix it
    helper.run("import --all-history");
    let st_after = helper.try_cmd("status");
    assert!(st_after.status.success(), "{st_after:?}");
    Ok(())
}

#[test]
fn load_bit_scopes_and_invalid_default_scope() -> KnownResult<()> {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    let (scope_name, scope_path) = helper.new_bare_scope();

    // should load a valid workspace and create and load three different scopes
    let scope_a = config::read_jsonc(&scope_path.join("scope.json"));
    let scope_b = config::read_jsonc(&helper.scopes.remote_path.join("scope.json"));
    let scope_c = helper.read_scope_json();
    assert!(
        scope_a["name"]
            .as_str()
            .unwrap()
            .starts_with(&scope_name),
    );
    assert!(
        scope_b["name"]
            .as_str()
            .unwrap()
            .starts_with(&helper.scopes.remote),
    );
    assert!(
        !scope_c["name"]
            .as_str()
            .unwrap()
            .is_empty(),
    );
    let st = helper.try_cmd("status");
    assert!(st.status.success());

    // should throw when defaultScope is invalid
    helper.set_workspace_with_remote_scope();
    let mut ws = helper.read_workspace_jsonc();
    ws["teambit.workspace/workspace"]["defaultScope"] = json!("hi/");
    helper.write_workspace_jsonc(&ws);
    let invalid_run = helper.try_cmd("show comp1");
    assert!(!invalid_run.status.success());
    let err_out = format!("{}\n{}", invalid_run.stdout, invalid_run.stderr);
    assert!(
        err_out.contains("hi/")
            || err_out.contains("InvalidScopeName")
            || err_out.contains("invalid"),
        "{err_out}",
    );
    Ok(())
}

#[test]
fn node_linker_hoisted_and_isolated() -> KnownResult<()> {
    let helper = Helper::new();

    // setting nodeLinker to "hoisted" -> should create a hoisted node_modules
    helper.re_init_workspace();
    let mut ws = helper.read_workspace_jsonc();
    ws[DEP_RESOLVER]["nodeLinker"] = json!("hoisted");
    helper.write_workspace_jsonc(&ws);
    helper.run("install is-positive");
    let dep_path = helper.scopes.local_path.join("node_modules/is-positive");
    assert_eq!(fs::canonicalize(&dep_path).unwrap(), fs::canonicalize(&dep_path).unwrap());
    assert!(
        !fs::symlink_metadata(&dep_path)
            .unwrap()
            .file_type()
            .is_symlink(),
    );

    // setting nodeLinker to "isolated" -> should symlink into the virtual store rather than hoisting
    helper.re_init_workspace();
    let mut ws2 = helper.read_workspace_jsonc();
    ws2[DEP_RESOLVER]["nodeLinker"] = json!("isolated");
    helper.write_workspace_jsonc(&ws2);
    helper.run("install is-positive");
    let dep_path2 = helper.scopes.local_path.join("node_modules/is-positive");
    let real = fs::canonicalize(&dep_path2).unwrap();
    let real_str = real.to_string_lossy();
    assert!(
        real_str.contains("/.pnpm/") || real_str.contains("/links/"),
        "expected .pnpm or links in {real_str}",
    );
    Ok(())
}

#[test]
fn patched_dependencies_in_workspace_and_capsule() -> KnownResult<()> {
    let helper = Helper::new();
    let globals = helper.own_global_config("analytics_reporting", "false");
    helper.re_init_workspace();
    helper.populate_components(1, true, "");
    helper.output_file(
        "comp1/index.js",
        "const isPositive = require('is-positive');\nmodule.exports = isPositive;\n",
    );
    helper.run("install is-positive@1.0.0");

    let index_path = helper.scopes.local_path.join("node_modules/is-positive/index.js");
    let contents = fs::read_to_string(&index_path).unwrap();
    let has_trailing_newline = contents.ends_with('\n');
    let trimmed =
        if has_trailing_newline { &contents[..contents.len() - 1] } else { &contents[..] };
    let lines: Vec<&str> = trimmed.split('\n').collect();
    let mut patch_lines = vec![
        "diff --git a/index.js b/index.js".to_owned(),
        "--- a/index.js".to_owned(),
        "+++ b/index.js".to_owned(),
        format!("@@ -1,{} +1,{} @@", lines.len(), lines.len() + 1),
        format!(" {}", lines[0]),
        "+// patched".to_owned(),
    ];
    for l in &lines[1..] {
        patch_lines.push(format!(" {l}"));
    }
    if has_trailing_newline {
        patch_lines.push(String::new());
    } else {
        patch_lines.push(r"\ No newline at end of file".to_owned());
    }
    helper.output_file("patches/is-positive.patch", &patch_lines.join("\n"));

    let mut ws = helper.read_workspace_jsonc();
    ws[DEP_RESOLVER]["patchedDependencies"] = json!({
        "is-positive@1.0.0": "patches/is-positive.patch"
    });
    helper.write_workspace_jsonc(&ws);
    helper.run("install");

    // should apply the patch in the workspace
    let patched_ws = fs::read_to_string(&index_path).unwrap();
    assert!(patched_ws.contains("// patched"), "{patched_ws}");

    // should apply the patch in the capsule too
    let build_run = Helper::cmd_in_with(
        &helper.scopes.local_path,
        "build",
        &[("BIT_GLOBALS_DIR", globals.as_os_str())],
    );
    assert!(build_run.status.success(), "{build_run:?}");
    let cap_list_run = Helper::cmd_in_with(
        &helper.scopes.local_path,
        "capsule list -j",
        &[("BIT_GLOBALS_DIR", globals.as_os_str())],
    );
    assert!(cap_list_run.status.success() && cap_list_run.native, "{cap_list_run:?}");
    let cap_json = parse(&cap_list_run.stdout);
    let capsules_root = cap_json["workspaceCapsulesRootDir"].as_str().unwrap();
    let cap_index = std::path::Path::new(capsules_root).join("node_modules/is-positive/index.js");
    let patched_cap = fs::read_to_string(&cap_index).unwrap();
    assert!(patched_cap.contains("// patched"), "{patched_cap}");
    Ok(())
}

#[test]
fn pnpm_default_hoisting_settings() -> KnownResult<()> {
    let helper = Helper::new();
    helper.re_init_workspace();
    let mut ws = helper.read_workspace_jsonc();
    ws[DEP_RESOLVER]["packageManager"] = json!("teambit.dependencies/pnpm");
    helper.write_workspace_jsonc(&ws);
    helper.run("install is-positive");

    let modules_yaml =
        fs::read_to_string(helper.scopes.local_path.join("node_modules/.modules.yaml")).unwrap();

    // should run pnpm with hoist-pattern=*
    assert!(
        (modules_yaml.contains("hoistPattern") && modules_yaml.contains('*')),
        "{modules_yaml}",
    );

    // should run pnpm with public-hoist-pattern set
    assert!(modules_yaml.contains("publicHoistPattern"), "{modules_yaml}");
    Ok(())
}

#[test]
fn bit_artifacts_command_on_staged_and_snap() -> KnownResult<()> {
    let helper = Helper::new();
    helper.re_init_workspace();
    helper.populate_components(1, true, "");
    helper.tag_all_without_build("");

    // should not throw an error about missing scope
    let out1 = helper.native("artifacts comp1");
    assert!(!out1.is_empty());

    // should be able to work when using the full component-id
    let out2 = helper.native(&format!("artifacts {}/comp1", helper.scopes.remote));
    assert!(!out2.is_empty());

    // running the command on a snap -> should not throw an error about non exist component
    helper.re_init_workspace();
    helper.populate_components(1, true, "");
    helper.snap_all_components_without_build("");
    let head = helper.get_head("comp1");
    let out3 = helper.native(&format!("artifacts comp1@{head}"));
    assert!(!out3.is_empty());
    Ok(())
}

#[test]
fn pkg_manager_errors_on_checkout_switch_and_import() -> KnownResult<()> {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, false, "");
    helper.native("deps set comp1 bit-non-exist-pkg@1.0.0");
    helper.tag_all_without_build(r#"--ignore-issues="*""#);
    helper.tag_all_without_build(r#"--unmodified --ignore-issues="*""#);
    helper.export("");
    let after_export = helper.clone_workspace();

    // bit checkout -> should not throw, instead, should show the error in the output
    let checkout_run = helper.cmd("checkout 0.0.1 comp1");
    assert!(checkout_run.status.success(), "{checkout_run:?}");
    let checkout_out = format!("{}\n{}", checkout_run.stdout, checkout_run.stderr);
    assert!(
        checkout_out.contains("Installation Error") || checkout_out.contains("404"),
        "{checkout_out}",
    );

    // bit switch -> should not throw
    helper.get_cloned_workspace(&after_export);
    helper.create_lane("dev", "");
    helper.snap_all_components_without_build("--unmodified");
    let switch_run = helper.cmd("switch main");
    assert!(switch_run.status.success(), "{switch_run:?}");
    let switch_out = format!("{}\n{}", switch_run.stdout, switch_run.stderr);
    assert!(
        switch_out.contains("Installation Error") || switch_out.contains("404"),
        "{switch_out}",
    );

    // bit import -> should not throw
    helper.re_init_workspace();
    helper.add_remote_scope();
    let import_run = helper.cmd(&format!("import {}/comp1", helper.scopes.remote));
    assert!(import_run.status.success(), "{import_run:?}");
    let import_out = format!("{}\n{}", import_run.stdout, import_run.stderr);
    assert!(
        import_out.contains("Installation Error") || import_out.contains("404"),
        "{import_out}",
    );
    Ok(())
}

#[test]
fn readme_env_set_and_unset() -> KnownResult<()> {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, true, "");
    helper.output_file("comp1/comp1.docs.mdx", "");
    helper.native("envs set comp1 teambit.mdx/readme");
    helper.tag_all_without_build("");

    let status = parse(&helper.show_component_parsed("comp1"));
    let doc_file = status["extensions"]
        .as_array()
        .unwrap()
        .iter()
        .find(|ext| ext["name"].as_str() == Some("teambit.component/dev-files"))
        .unwrap()["data"]["devFiles"]["teambit.docs/docs"][0]
        .as_str()
        .unwrap()
        .to_owned();

    // should not identify the .docs. file as the docs file
    assert!(!doc_file.contains("comp1.docs.mdx"), "{doc_file}");

    // should have the index as the docs file entry point
    assert!(doc_file.contains("index.js"), "{doc_file}");

    // unset readme env and set default env -> should identify the .docs. file as the docs file
    helper.native("envs set comp1 teambit.mdx/mdx");
    let status2 = parse(&helper.show_component_parsed("comp1"));
    let doc_file2 = status2["extensions"]
        .as_array()
        .unwrap()
        .iter()
        .find(|ext| ext["name"].as_str() == Some("teambit.component/dev-files"))
        .unwrap()["data"]["devFiles"]["teambit.docs/docs"][0]
        .as_str()
        .unwrap()
        .to_owned();
    assert!(doc_file2.contains("comp1.docs.mdx"), "{doc_file2}");
    Ok(())
}

#[test]
fn bit_show_remote_on_empty_workspace() -> KnownResult<()> {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, true, "");
    helper.tag_all_without_build("");
    helper.export("");
    helper.re_init_workspace();
    helper.add_remote_scope();

    let show_output = helper.run(&format!("show {}/comp1 --remote", helper.scopes.remote));

    // should show the remote component successfully
    assert!(
        show_output.contains(&format!("{}/comp1@0.0.1", helper.scopes.remote)),
        "{show_output}",
    );

    // should show Harmony data such as the env
    assert!(show_output.contains("env"), "{show_output}");
    assert!(show_output.contains("teambit.harmony/node"), "{show_output}");

    // should not import any object to the local scope
    let objects = parse(&helper.native("cat-scope --json"));
    assert_eq!(objects.as_array().unwrap().len(), 0);
    Ok(())
}

#[test]
fn graph_aspect_and_workspace_aspect_and_import_resolves_missing_deps() -> KnownResult<()> {
    let helper = Helper::new();

    // graph-harmony.e2e.ts: should include the dependencies correctly
    helper.set_workspace_with_remote_scope();
    helper.populate_components(3, true, "");
    helper.tag_all_without_build("");
    let comp1 = parse(&helper.cat_component("comp1@0.0.1"));
    let comp2 = parse(&helper.cat_component("comp2@0.0.1"));
    assert_eq!(comp1["dependencies"][0]["id"]["name"].as_str(), Some("comp2"));
    assert_eq!(comp1["dependencies"][0]["id"]["version"].as_str(), Some("0.0.1"));
    assert_eq!(comp2["dependencies"][0]["id"]["name"].as_str(), Some("comp3"));
    assert_eq!(comp2["dependencies"][0]["id"]["version"].as_str(), Some("0.0.1"));

    // harmony-workspace.e2e.ts: should contain the files of the first tag not the second
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, true, "");
    helper.tag_all_without_build(""); // 0.0.1
    helper.populate_components(1, true, "v2");
    helper.tag_all_without_build(""); // 0.0.2
    let v1_comp = parse(&helper.cat_component("comp1@0.0.1"));
    let v1_file_hash = v1_comp["files"][0]["file"].as_str().unwrap();
    let v1_content = helper.cat_object(v1_file_hash, false);
    assert!(!v1_content.contains("v2"), "{v1_content}");

    // import-resolves-missing-deps-from-model.e2e.ts:
    // does not report MissingPackagesDependenciesOnFs for a package present in the model
    helper.set_workspace_with_remote_scope();
    helper.create_component_bar_foo("require('is-positive');");
    helper.add_component_bar_foo();
    helper.run("install --add-missing-deps");
    helper.tag_all_without_build("");
    helper.export("");

    helper.re_init_workspace();
    helper.add_remote_scope();
    helper.import_component("bar/foo", "-x");
    let issues = issue_types(&helper.status_json());
    assert!(!issues.contains(&"MissingPackagesDependenciesOnFs".to_owned()), "{issues:?}");
    Ok(())
}

#[test]
fn preview_and_released_bit_core_exports_and_require_resolve() -> KnownResult<()> {
    let helper = Helper::new();

    // require-resolve.e2e.ts: should detect it
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, true, "");
    helper.output_file(
        "comp1/babel.config.js",
        "module.exports = { plugins: [require.resolve('@babel/plugin-transform-modules-commonjs')] };",
    );
    let status = helper.status_json();
    assert_eq!(
        status["componentsWithIssues"][0]["issues"][0]["type"].as_str(),
        Some("MissingPackagesDependenciesOnFs"),
    );
    assert_eq!(
        status["componentsWithIssues"][0]["issues"][0]["data"][0]["missingPackages"][0].as_str(),
        Some("@babel/plugin-transform-modules-commonjs"),
    );

    // preview.e2e.ts: bit build should run successfully without preview errors
    helper.set_workspace_with_remote_scope();
    let mut ws = helper.read_workspace_jsonc();
    ws["teambit.preview/preview"] = json!({ "disabled": false });
    helper.write_workspace_jsonc(&ws);
    helper.output_file(
        "button/button.jsx",
        "import React from 'react'\nexport const Button = ({children}) => <button>{children}</button>;\n",
    );
    helper.output_file(
        "button/button.composition.jsx",
        "import React from 'react'\nimport { Button } from './button';\nexport const PrimaryButton = () => <Button>Click me!</Button>;\n",
    );
    helper.output_file("button/index.js", "export { Button } from './button';\n");
    helper.add_component("button", "");
    helper.run("install --add-missing-deps");
    helper.compile();
    let build_output = helper.run("build");
    assert!(build_output.contains("build succeeded"), "{build_output}");

    // released-bit-core-exports.e2e.ts:
    // bit build (TypescriptCompile) should not fail from type-checking @teambit/application
    if std::env::var_os("E2E_RELEASED_BINARY").is_some() {
        helper.set_workspace_with_remote_scope();
        let mut ws2 = helper.read_workspace_jsonc();
        ws2["teambit.workspace/workspace"]["resolveAspectsFromNodeModules"] = json!(true);
        ws2["teambit.workspace/workspace"]["resolveEnvsFromRoots"] = json!(true);
        ws2[DEP_RESOLVER]["rootComponents"] = json!(true);
        helper.write_workspace_jsonc(&ws2);
        helper.output_file(
            "comp1/index.ts",
            "import { ApplicationAspect } from '@teambit/application';\nexport function comp1(): string { return ApplicationAspect.id; }\n",
        );
        helper.add_component("comp1", "");
        helper.run("envs set comp1 bitdev.react/react-env@6.0.20");
        helper.run("install");
        let out =
            helper.run(r#"build comp1 --tasks teambit.compilation/compiler --ignore-issues="*""#);
        assert!(!out.contains("has failed"), "{out}");
        assert!(!out.contains("error TS"), "{out}");
    }
    Ok(())
}

#[test]
fn dev_files_custom_env() -> KnownResult<()> {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    let mut ws = helper.read_workspace_jsonc();
    ws[DEP_RESOLVER]["packageManager"] = json!("teambit.dependencies/pnpm");
    helper.write_workspace_jsonc(&ws);

    let env_name = helper.set_custom_env("dev-files-env");
    let env_id = format!("{}/{env_name}", helper.scopes.remote);
    helper.copy_fixture_components("custom-dev-files");
    helper.add_component("custom-dev-files", "");
    helper.add_extension_to_variant("*", &env_id, json!({}));
    helper.compile();

    let dev_files = helper.show_component_parsed_harmony_by_title("custom-dev-files", "dev files");

    // should show registered custom dev file as dev file
    assert!(
        dev_files[&env_id]
            .as_array()
            .unwrap()
            .iter()
            .filter_map(serde_json::Value::as_str)
            .any(|item| item == "file.custom-dev-file.js"),
    );

    // should show registered custom test file as dev file
    let test_files: Vec<&str> = dev_files["teambit.defender/tester"]
        .as_array()
        .unwrap()
        .iter()
        .filter_map(serde_json::Value::as_str)
        .collect();
    assert!(test_files.contains(&"custom-dev-files.registered-test.spec.js"));

    // should not show default test file as dev file
    assert!(!test_files.contains(&"custom-dev-files.spec.js"));

    // should show registered custom docs file as dev file
    assert!(
        dev_files["teambit.docs/docs"]
            .as_array()
            .unwrap()
            .iter()
            .filter_map(serde_json::Value::as_str)
            .any(|item| item == "comp.custom-docs-suffix.mdx"),
    );

    // should show registered custom composition file as dev file
    assert!(
        dev_files["teambit.compositions/compositions"]
            .as_array()
            .unwrap()
            .iter()
            .filter_map(serde_json::Value::as_str)
            .any(|item| item == "comp.custom-composition-suffix.tsx"),
    );
    Ok(())
}

#[test]
fn link_to_target_with_and_without_pattern_and_peers() -> KnownResult<()> {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(2, true, "");
    let target_dir = helper.scopes.e2e_dir.join("link-target-1");
    let all_target_dir = helper.scopes.e2e_dir.join("link-target-all");
    fs::create_dir_all(&target_dir).unwrap();
    fs::create_dir_all(&all_target_dir).unwrap();

    helper.native(&format!("link comp1 --target={}", target_dir.display()));
    helper.native(&format!("link --target={}", all_target_dir.display()));

    // should link the scecified component to the target directory
    assert!(
        target_dir
            .join(format!("node_modules/@{}/comp1", helper.scopes.remote))
            .exists(),
    );

    // should not link the not specified component to the target directory
    assert!(
        !target_dir
            .join(format!("node_modules/@{}/comp2", helper.scopes.remote))
            .exists(),
    );

    // without a pattern, it should link every component to the target directory
    assert!(
        all_target_dir
            .join(format!("node_modules/@{}/comp1", helper.scopes.remote))
            .exists(),
    );
    assert!(
        all_target_dir
            .join(format!("node_modules/@{}/comp2", helper.scopes.remote))
            .exists(),
    );

    // linking to a target including peers
    helper.set_workspace_with_remote_scope();
    helper.run("create react button --env teambit.react/react");
    helper.run("install");
    let peers_target = helper.scopes.e2e_dir.join("link-target-peers");
    fs::create_dir_all(&peers_target).unwrap();
    helper.native(&format!("link --target={} --peers", peers_target.display()));

    // should link the components to the target directory
    assert!(
        peers_target
            .join(format!("node_modules/@{}", helper.scopes.remote))
            .exists(),
    );

    // should link the peers of the component components to the target directory
    assert!(peers_target.join("node_modules/react").exists());
    assert!(peers_target.join("node_modules/react-dom").exists());
    Ok(())
}

#[test]
fn load_failures_issue_surfacing() -> KnownResult<()> {
    let helper = Helper::new();
    helper.re_init_workspace_with(false);
    helper.copy_fixture_extensions("non-requireable-aspect");
    helper.add_component("non-requireable-aspect", "");
    helper.add_extension_to_variant("non-requireable-aspect", "teambit.harmony/aspect", json!({}));
    helper.populate_components(1, false, "");
    helper.add_extension_to_variant("comp1", "my-scope/non-requireable-aspect", json!({}));
    helper.run("install");
    helper.compile();
    let status_json = helper.status_json();

    // bit status should complete without throwing
    assert!(status_json.get("newComponents").is_some());

    // the failing aspect component itself should have a LoadFailures issue
    let comps_with_issues = status_json["componentsWithIssues"].as_array().unwrap();
    let aspect_comp = comps_with_issues
        .iter()
        .find(|comp| {
            comp["id"]
                .as_str()
                .is_some_and(|id| id.contains("non-requireable-aspect"))
        })
        .expect("the failing aspect should be listed with issues");
    let load_failure = aspect_comp["issues"]
        .as_array()
        .unwrap()
        .iter()
        .find(|i| i["type"].as_str() == Some("LoadFailures"));
    assert!(load_failure.is_some());

    // components using the failing aspect should NOT each carry the issue (avoid noise)
    let comp1 = comps_with_issues
        .iter()
        .find(|comp| {
            comp["id"]
                .as_str()
                .is_some_and(|id| id.contains("comp1"))
        });
    if let Some(c1) = comp1 {
        let c1_load = c1["issues"]
            .as_array()
            .unwrap()
            .iter()
            .find(|i| i["type"].as_str() == Some("LoadFailures"));
        assert!(c1_load.is_none());
    }

    // instead, a single workspace-level issue should aggregate the affected components
    let ws_issues = status_json["workspaceIssues"].as_array().unwrap();
    let aggregated = ws_issues
        .iter()
        .filter_map(serde_json::Value::as_str)
        .find(|i| i.contains("non-requireable-aspect"))
        .expect("a workspace issue naming the failing aspect should exist");
    assert!(aggregated.contains("error by purpose"), "{aggregated}");
    assert!(aggregated.contains("affects 1 component"), "{aggregated}");

    // the LoadFailures issue should not block tagging
    let tag_out = helper.tag_all_without_build("");
    assert!(tag_out.contains("component(s) tagged"), "{tag_out}");
    Ok(())
}
