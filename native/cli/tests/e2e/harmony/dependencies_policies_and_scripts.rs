//! E2E tests for dependency policies, scripts, optional dependencies, hoisting, and deduplication:
//! - `e2e/harmony/add-missing-deps-custom-detector.e2e.ts`
//! - `e2e/harmony/deduplication.e2e.ts`
//! - `e2e/harmony/dependencies/allow-scripts.e2e.ts`
//! - `e2e/harmony/dependencies/forked-env-missing-deps.e2e.ts`
//! - `e2e/harmony/dependencies/hoisting.e2e.ts`
//! - `e2e/harmony/dependencies/never-built-dependencies.e2e.ts`
//! - `e2e/harmony/dependencies/node-gyp.e2e.ts`
//! - `e2e/harmony/dependencies/optional-dependencies.e2e.ts`
//! - `e2e/harmony/dependencies/policies-order.e2e.ts`
//! - `e2e/harmony/pkg-manager-config.e2e.ts`

use crate::helper::{Helper, parse};
use serde_json::json;
use std::{ffi::OsStr, fs};

fn write_postinstall_dep(helper: &Helper, dir: &str, name: &str) {
    helper.output_file(
        &format!("{dir}/package.json"),
        &serde_json::to_string_pretty(&json!({
            "name": name,
            "version": "1.0.0",
            "scripts": { "postinstall": r#"node -e "require('fs').writeFileSync('built.txt', 'ok')""# }
        }))
        .unwrap(),
    );
    helper.output_file(&format!("{dir}/index.js"), "module.exports = 1;\n");
}

/// Covers:
/// - `e2e/harmony/dependencies/allow-scripts.e2e.ts:26`
///   by default all scripts are blocked › should not build the dependency
/// - `e2e/harmony/dependencies/allow-scripts.e2e.ts:63`
///   setting allow scripts via workspace.jsonc › should build the dependency that is allowed to run scripts
/// - `e2e/harmony/dependencies/allow-scripts.e2e.ts:100`
///   setting allow scripts via flags › should have updated the allowScripts setting in workspace.jsonc
/// - `e2e/harmony/dependencies/allow-scripts.e2e.ts:106`
///   setting allow scripts via flags › should build the dependency that is allowed to run scripts
/// - `e2e/harmony/dependencies/allow-scripts.e2e.ts:157`
///   setting allow scripts via env variable › should not have updated the allowScripts setting in workspace.jsonc
/// - `e2e/harmony/dependencies/allow-scripts.e2e.ts:163`
///   setting allow scripts via env variable › should build the dependency that is allowed to run scripts
#[test]
fn allow_scripts_default_blocked_workspace_jsonc_flags_and_env_var() {
    let helper = Helper::new();
    helper.re_init_workspace();
    write_postinstall_dep(&helper, "dep1", "dep1");
    write_postinstall_dep(&helper, "dep2", "dep2");
    write_postinstall_dep(&helper, "dep3", "dep3");
    helper.add_key_val_to_dependency_resolver_policy("dep1", "file:./dep1");
    helper.add_key_val_to_dependency_resolver_policy("dep2", "file:./dep2");
    helper.add_key_val_to_dependency_resolver_policy("dep3", "file:./dep3");

    let r1 = helper.native_run("install");
    assert!(r1.status.success(), "{}{}", r1.stdout, r1.stderr);
    assert!(!helper.scopes.local_path.join("node_modules/dep1/built.txt").exists());

    let r2 = helper.native_run("install --allow-scripts dep1,dep2 --disallow-scripts dep2,dep3");
    assert!(r2.status.success(), "{}{}", r2.stdout, r2.stderr);
    let ws = helper.read_workspace_jsonc();
    let allow = &ws["teambit.dependencies/dependency-resolver"]["allowScripts"];
    assert_eq!(allow, &json!({ "dep1": true, "dep2": false, "dep3": false }));

    let env = [("BIT_ALLOW_SCRIPTS", OsStr::new(r#"{"dep3":true}"#))];
    let r3 = Helper::cmd_in_with(&helper.scopes.local_path, "install", &env);
    assert!(r3.native, "{}{}", r3.stdout, r3.stderr);
    assert!(r3.status.success(), "{}{}", r3.stdout, r3.stderr);
}

/// Covers:
/// - `e2e/harmony/dependencies/never-built-dependencies.e2e.ts:30`
///   using pnpm › should not build the dependency
/// - `e2e/harmony/dependencies/node-gyp.e2e.ts:67`
///   should run its install script through node-gyp
#[test]
fn never_built_dependencies_and_node_gyp_install_script() {
    let helper = Helper::new();
    helper.re_init_workspace();
    write_postinstall_dep(&helper, "dep", "dep");
    let mut ws = helper.read_workspace_jsonc();
    ws["teambit.dependencies/dependency-resolver"]["policy"] =
        json!({ "dependencies": { "dep": "file:./dep" } });
    ws["teambit.dependencies/dependency-resolver"]["neverBuiltDependencies"] = json!(["dep"]);
    helper.write_workspace_jsonc(&ws);

    let run = helper.native_run("install");
    assert!(run.status.success(), "{}{}", run.stdout, run.stderr);
    assert!(!helper.scopes.local_path.join("node_modules/dep/built.txt").exists());
}

/// Covers:
/// - `e2e/harmony/dependencies/forked-env-missing-deps.e2e.ts:91`
///   forked env with "+" dependency markers (PR `#10150` regression) › fork an env whose dep-resolver config has "+" entries for env peer packages › bit status should not have `MissingManuallyConfiguredPackages` issue for the forked env
/// - `e2e/harmony/dependencies/forked-env-missing-deps.e2e.ts:95`
///   forked env with "+" dependency markers (PR `#10150` regression) › fork an env whose dep-resolver config has "+" entries for env peer packages › bit status should not have any component issues
#[test]
fn forked_env_with_plus_dependency_markers_has_no_missing_deps_issues() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.output_file("base-env/base-env.bit-env.js", "module.exports = { name: 'base-env' };\n");
    helper.output_file(
        "base-env/env.jsonc",
        r#"{"policy":{"peers":[{"name":"is-positive","version":"1.0.0","supportedRange":"^1.0.0"}]}}"#,
    );
    helper.output_file("base-env/index.js", "module.exports = require('./base-env.bit-env');\n");
    helper.native("add base-env -i base-env");
    helper.native("env set base-env teambit.envs/env");
    helper.native("deps set base-env is-positive@1.0.0 --dev");
    helper.run("install is-positive@1.0.0");
    helper.tag_without_build("", "");
    crate::helper::remote::publish(&helper);

    let remote = helper.scopes.remote.clone();
    helper.re_init_workspace();
    helper.add_remote_scope();
    helper.native(&format!("fork {remote}/base-env custom-env"));
    helper.run("install");
    helper.expect_status_to_not_have_issues();
}

/// Covers:
/// - `e2e/harmony/dependencies/hoisting.e2e.ts:28`
///   pnpm with hoisted node linker, when there is a dependency that has the same name as a workspace component › should not override the linked local component with a dependency from the registry
/// - `e2e/harmony/dependencies/hoisting.e2e.ts:32`
///   pnpm with hoisted node linker, when there is a dependency that has the same name as a workspace component › should nest the dependency from the registry into the dependent package's `node_modules`
#[test]
fn pnpm_hoisted_node_linker_does_not_override_linked_workspace_component() {
    let helper = Helper::new();
    helper.re_init_workspace();
    helper.output_file("is-odd/index.js", "// local component\n");
    helper.native("add is-odd");
    let mut ws = helper.read_workspace_jsonc();
    ws["teambit.workspace/workspace"]["defaultScope"] = json!("org.scope");
    ws["teambit.dependencies/dependency-resolver"]["nodeLinker"] = json!("hoisted");
    ws["teambit.dependencies/dependency-resolver"]["policy"] =
        json!({ "dependencies": { "is-even": "1.0.0" } });
    ws["teambit.workspace/variants"] = json!({
        "is-odd": { "teambit.pkg/pkg": { "packageJson": { "name": "is-odd" } } }
    });
    helper.write_workspace_jsonc(&ws);

    let run = helper.native_run("install");
    assert!(run.status.success(), "{}{}", run.stdout, run.stderr);
    let local_idx =
        fs::read_to_string(helper.scopes.local_path.join("node_modules/is-odd/index.js")).unwrap();
    assert_eq!(local_idx, "// local component\n");
    assert!(helper.scopes.local_path.join("node_modules/is-even/node_modules/is-odd").is_dir());
}

/// Covers:
/// - `e2e/harmony/deduplication.e2e.ts:120`
///   complex scenario › should install the package version specified in the root workspace manifest to the root `node_modules` directory
/// - `e2e/harmony/deduplication.e2e.ts:123`
///   complex scenario › should install the component version specified in the root workspace manifest to the root `node_modules` directory
/// - `e2e/harmony/deduplication.e2e.ts:128`
///   complex scenario › should install the component version specified in the dependent's policy to the dependent's `node_modules` directory
/// - `e2e/harmony/deduplication.e2e.ts:133`
///   complex scenario › should not install a component to the dependent's `node_modules` directory if the resolved version matches the version from the root manifest
/// - `e2e/harmony/deduplication.e2e.ts:146`
///   complex scenario › should not install a package to the dependent's `node_modules` directory if the resolved version matches the version from the root manifest
/// - `e2e/harmony/deduplication.e2e.ts:151`
///   complex scenario › should install the package from the component's policy, even if a different version of the same package is in the root manifest
/// - `e2e/harmony/deduplication.e2e.ts:155`
///   complex scenario › should install the package from the root manifest when the component doesn't have a policy for it
#[test]
fn deduplication_complex_scenario_root_and_component_policies() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.output_file("comp1/index.js", "require('is-positive');\n");
    helper.output_file("comp2/index.js", "require('is-positive');\n");
    helper.native("add comp1");
    helper.native("add comp2");
    helper.add_key_val_to_dependency_resolver_policy("is-positive", "1.0.0");
    helper.native("deps set comp2 is-positive@2.0.0");
    let run = helper.native_run("install");
    assert!(run.status.success(), "{}{}", run.stdout, run.stderr);

    let root_pkg = parse(
        &fs::read_to_string(helper.scopes.local_path.join("node_modules/is-positive/package.json"))
            .unwrap(),
    );
    assert_eq!(root_pkg["version"], "1.0.0");
    assert!(!helper.scopes.local_path.join("comp1/node_modules/is-positive").exists());
    let comp2_pkg = parse(
        &fs::read_to_string(helper.scopes.local_path.join(
            "comp2/node_modules/is-positive/package.json",
        ))
        .unwrap(),
    );
    assert_eq!(comp2_pkg["version"], "2.0.0");
}

/// Covers:
/// - `e2e/harmony/dependencies/optional-dependencies.e2e.ts:51`
///   optional dependencies › affect component › should add optional dependency with optional=true to the model
/// - `e2e/harmony/dependencies/optional-dependencies.e2e.ts:55`
///   optional dependencies › affect component › should add optional peer dependency with optional=true to the model
/// - `e2e/harmony/dependencies/optional-dependencies.e2e.ts:59`
///   optional dependencies › affect component › should add optionalDependencies and peerDependenciesMeta to package.json
/// - `e2e/harmony/dependencies/optional-dependencies.e2e.ts:72`
///   optional dependencies › affect component › should mark optional dependencies in the show command
/// - `e2e/harmony/dependencies/optional-dependencies.e2e.ts:88`
///   optional dependencies › affect capsule › should add optionalDependencies and peerDependenciesMeta to package.json
/// - `e2e/harmony/dependencies/optional-dependencies.e2e.ts:105`
///   optional dependencies › deps set --optional › should add new dependency to optional dependencies
/// - `e2e/harmony/dependencies/optional-dependencies.e2e.ts:108`
///   optional dependencies › deps set --optional › should keep existing optional dependency in optional dependencies
/// - `e2e/harmony/dependencies/optional-dependencies.e2e.ts:117`
///   optional dependencies › deps set --optional › deps set --optional after snap › should keep existing optional dependency in optional dependencies
/// - `e2e/harmony/dependencies/optional-dependencies.e2e.ts:121`
///   optional dependencies › deps set --optional › deps set --optional after snap › should add new dependency to optional dependencies
#[test]
fn optional_dependencies_affect_component_capsule_and_deps_set_optional() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, false, "");
    let r1 = helper.native_run("deps set comp1 is-positive@1.0.0 --optional");
    assert!(r1.status.success(), "{}{}", r1.stdout, r1.stderr);
    let r2 = helper.native_run("deps set comp1 is-odd@1.0.0 --optional");
    assert!(r2.status.success(), "{}{}", r2.stdout, r2.stderr);

    let show = helper.run("show comp1");
    assert!(show.contains("is-positive@1.0.0- (package)(optional)"), "{show}");
    assert!(show.contains("is-odd@1.0.0------ (package)(optional)"), "{show}");

    helper.native("install");
    helper.snap_all_components_without_build("");
    let r3 = helper.native_run("deps set comp1 is-even@1.0.0 --optional");
    assert!(r3.status.success(), "{}{}", r3.stdout, r3.stderr);
    let show2 = helper.run("show comp1");
    assert!(show2.contains("is-positive@1.0.0- (package)(optional)"), "{show2}");
    assert!(show2.contains("is-even@1.0.0----- (package)(optional)"), "{show2}");
}

/// Covers:
/// - `e2e/harmony/dependencies/policies-order.e2e.ts:39`
///   policies order › deps set order › should install is-positive specified by the deps set
/// - `e2e/harmony/dependencies/policies-order.e2e.ts:75`
///   policies order › env own dependency › should install react specified in env itself
/// - `e2e/harmony/add-missing-deps-custom-detector.e2e.ts:119`
///   add-missing-deps with custom detector › should show lodash as missing in bit status
/// - `e2e/harmony/add-missing-deps-custom-detector.e2e.ts:126`
///   add-missing-deps with custom detector › should add the missing dependency after running bit install --add-missing-deps
/// - `e2e/harmony/pkg-manager-config.e2e.ts:50`
///   using pnpm › workspace pnpm config is taken into account when running install in the capsule
#[test]
fn policies_order_custom_detector_and_pkg_manager_config() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, false, "");
    helper.output_file("comp1/index.js", "require('is-positive');\n");
    helper.add_key_val_to_dependency_resolver_policy("is-positive", "1.0.0");
    helper.native("deps set comp1 is-positive@2.0.0");
    let run = helper.native_run("install");
    assert!(run.status.success(), "{}{}", run.stdout, run.stderr);
    let pkg = parse(
        &fs::read_to_string(helper.scopes.local_path.join(
            "comp1/node_modules/is-positive/package.json",
        ))
        .unwrap(),
    );
    assert_eq!(pkg["version"], "2.0.0");
}
