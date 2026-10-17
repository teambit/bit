//! Actual builder artifacts and failure publication boundaries.
use super::workspace;
use crate::helper::{Helper, config, parse};
use std::ffi::OsStr;

const BUILD_ENV: &str = r"// @ts-nocheck
const {EnvsAspect}=require('@teambit/envs');
const {NodeAspect}=require('@teambit/node');
const fs=require('fs');const path=require('path');
class BuildEnv {
 static dependencies=[EnvsAspect,NodeAspect];
 static async provider([envs,node]) {
  const env=node.compose([]);
  env.getDependencies=()=>({});
  env.modifyPackageJson=(component,manifest)=>{
   manifest.nativeEnvVersion=component.id.version??'new';
   manifest.nativeEnvObservedVersion=manifest.version;
   if(__OVERRIDE_VERSION__)manifest.version='3.2.1';
   if(__PACKAGE_FAIL__ && /^[a-f0-9]{40}$/.test(component.id.version??'')){console.log('fixture package side effect');throw new Error('fixture package rejected');}
   return manifest;
  };
  env.getBuildPipe=()=>[{aspectId:'__ENV__',name:'NativeArtifact',execute:async(context)=>{
   const capsules=context.capsuleNetwork.seedersCapsules;
   for(const capsule of capsules)fs.writeFileSync(path.join(capsule.path,'native-artifact.txt'),'Rust owns the artifact Source object\n');
   if(__FAIL__) {console.log('fixture builder side effect');return {componentsResults:capsules.map((capsule)=>({component:capsule.component,errors:['fixture builder rejected']}))};}
   return {componentsResults:capsules.map((capsule)=>({component:capsule.component})),artifacts:[{name:'fixture',globPatterns:['native-artifact.txt']}]};
  }}];
  env.getTagPipe=()=>[];env.getSnapPipe=()=>[];
  envs.registerEnv(env);return new BuildEnv();
 }
}
module.exports={default:BuildEnv};";

fn build_workspace(fail: bool) -> Helper {
    build_workspace_with(fail, false)
}

fn build_workspace_with(fail: bool, package_fail: bool) -> Helper {
    build_workspace_options(fail, package_fail, false)
}

fn build_workspace_options(fail: bool, package_fail: bool, override_version: bool) -> Helper {
    let helper = workspace();
    let id = format!("{}/env/build", helper.scopes.remote);
    let source = BUILD_ENV
        .replace("__ENV__", &id)
        .replace("__FAIL__", if fail { "true" } else { "false" })
        .replace("__PACKAGE_FAIL__", if package_fail { "true" } else { "false" })
        .replace("__OVERRIDE_VERSION__", if override_version { "true" } else { "false" });
    helper.output_file("build-env/index.js", &source);
    helper.run("add build-env -i env/build");
    config::set_component_env(&helper.scopes.local_path, "env/build", "teambit.envs/env");
    helper.run("link");
    helper.output_file("build-env/dist/index.js", &source);
    let setup = Helper::cmd_in_with(
        &helper.scopes.local_path,
        "tag env/build -m env",
        &[("BIT_NATIVE", OsStr::new("off"))],
    );
    assert!(setup.status.success(), "{} {}", setup.stdout, setup.stderr);
    config::set_component_env(&helper.scopes.local_path, "bar/foo", &id);
    helper
}

#[test]
fn custom_build_pipeline_publishes_native_artifacts() {
    let helper = build_workspace(false);
    let oracle = helper.clone_workspace();
    let node = Helper::cmd_in_with(
        &oracle,
        "snap bar/foo --build --skip-tests --skip-tasks teambit.compilation/compiler -m built",
        &[("BIT_NATIVE", OsStr::new("off"))],
    );
    assert!(node.status.success(), "{} {}", node.stdout, node.stderr);
    helper.native(
        "snap bar/foo --build --skip-tests --skip-tasks teambit.compilation/compiler -m built",
    );
    let value = parse(&helper.run("cat-component bar/foo@latest --json"));
    assert_eq!(value["buildStatus"], "succeed");
    let builder = value["extensions"]
        .as_array()
        .unwrap()
        .iter()
        .find(|row| row["name"] == "teambit.pipelines/builder")
        .unwrap();
    let artifacts = builder["data"]["artifacts"].as_array().unwrap();
    let artifact = artifacts
        .iter()
        .find(|artifact| artifact["name"] == "fixture")
        .unwrap();
    let hash = artifact["files"][0]["file"].as_str().unwrap();
    assert!(
        helper
            .run(&format!("cat-object {hash} -s"))
            .contains("Rust owns the artifact Source object"),
    );
}

fn build_output(output: &str, hash: &str) -> String {
    output
        .replace(hash, "SNAP_HASH")
        .lines()
        .map(|line| {
            for marker in
                ["Succeeded in ", "Completed successfully in ", "Failed in ", " has failed in "]
            {
                if let Some((prefix, _)) = line.split_once(marker) {
                    return format!("{prefix}{marker}DURATION");
                }
            }
            line.to_owned()
        })
        .collect::<Vec<_>>()
        .join("\n")
}

#[test]
fn failed_custom_builder_retains_only_the_canonical_staged_snap_prefix() {
    let helper = build_workspace(true);
    let before_bitmap = std::fs::read(helper.scopes.local_path.join(".bitmap")).unwrap();
    let before_workspace = std::fs::read(helper.scopes.local_path.join("workspace.jsonc")).unwrap();
    let oracle = helper.clone_workspace();
    let command =
        "snap bar/foo --build --skip-tests --skip-tasks teambit.compilation/compiler -m failed";
    let node = Helper::cmd_in_with(&oracle, command, &[("BIT_NATIVE", OsStr::new("off"))]);
    assert!(!node.status.success(), "{} {}", node.stdout, node.stderr);
    let native = helper.native_run(command);
    assert!(!native.status.success(), "{} {}", native.stdout, native.stderr);
    let staged =
        std::fs::read_to_string(helper.scopes.local_path.join(".bit/staged-snaps")).unwrap();
    let node_staged = std::fs::read_to_string(oracle.join(".bit/staged-snaps")).unwrap();
    let native_hash = staged.lines().last().unwrap();
    let node_hash = node_staged.lines().last().unwrap();
    assert_eq!(
        build_output(&native.stdout, native_hash),
        build_output(&node.stdout, node_hash),
        "native stderr: {}",
        native.stderr,
    );
    assert_eq!(
        native.stderr.replace(native_hash, "SNAP_HASH"),
        node.stderr.replace(node_hash, "SNAP_HASH"),
    );
    assert_eq!(std::fs::read(helper.scopes.local_path.join(".bitmap")).unwrap(), before_bitmap);
    assert_eq!(
        std::fs::read(helper.scopes.local_path.join("workspace.jsonc")).unwrap(),
        before_workspace,
    );
    assert!(
        !helper.scopes.local_path
            .join(".bit/objects")
            .join(&native_hash[..2])
            .join(&native_hash[2..])
            .exists(),
    );
    assert!(
        !oracle
            .join(".bit/objects")
            .join(&node_hash[..2])
            .join(&node_hash[2..])
            .exists(),
    );
    assert_eq!(
        config::read_jsonc(&helper.scopes.local_path.join(".bitmap")),
        config::read_jsonc(&oracle.join(".bitmap")),
    );
}

#[test]
fn package_callback_failure_keeps_published_objects_and_old_bitmap() {
    let helper = build_workspace_with(false, true);
    helper.delete_path(&format!("node_modules/@{}/bar.foo", helper.scopes.remote));
    let bitmap = std::fs::read(helper.scopes.local_path.join(".bitmap")).unwrap();
    let oracle = helper.clone_workspace();
    let command = "snap bar/foo -m package";
    let node = Helper::cmd_in_with(&oracle, command, &[("BIT_NATIVE", OsStr::new("off"))]);
    assert!(!node.status.success(), "{} {}", node.stdout, node.stderr);
    assert!(node.stderr.contains("fixture package rejected"), "{} {}", node.stdout, node.stderr);
    let native = helper.native_run(command);
    assert!(!native.status.success(), "{} {}", native.stdout, native.stderr);
    for root in [&oracle, &helper.scopes.local_path] {
        assert_eq!(std::fs::read(root.join(".bitmap")).unwrap(), bitmap);
        let staged = std::fs::read_to_string(root.join(".bit/staged-snaps")).unwrap();
        let hash = staged.lines().last().unwrap();
        assert!(
            root.join(".bit/objects")
                .join(&hash[..2])
                .join(&hash[2..])
                .exists(),
            "Version must already be published before linker callback",
        );
    }
    assert_eq!(native.stdout, node.stdout, "native stderr: {}", native.stderr);
    assert_eq!(native.stderr, node.stderr);
}

#[test]
fn unlinked_custom_package_callback_observes_raw_version_and_overrides_manifest_version() {
    let helper = build_workspace_options(false, false, true);
    let package = format!("node_modules/@{}/bar.foo", helper.scopes.remote);
    helper.delete_path(&package);
    let oracle = helper.clone_workspace();
    let command = "snap bar/foo -m custom-package";
    let node = Helper::cmd_in_with(&oracle, command, &[("BIT_NATIVE", OsStr::new("off"))]);
    assert!(node.status.success(), "{} {}", node.stdout, node.stderr);
    helper.native(command);
    let manifest = |root: &std::path::Path| {
        parse(&std::fs::read_to_string(root.join(&package).join("package.json")).unwrap())
    };
    let native = manifest(&helper.scopes.local_path);
    let node = manifest(&oracle);
    assert_eq!(native["version"], "3.2.1");
    let native_hash = native["componentId"]["version"].as_str().unwrap();
    let node_hash = node["componentId"]["version"].as_str().unwrap();
    assert_eq!(native["nativeEnvObservedVersion"], native_hash);
    assert_eq!(node["nativeEnvObservedVersion"], node_hash);
    assert_eq!(
        parse(&native.to_string().replace(native_hash, "SNAP_HASH")),
        parse(&node.to_string().replace(node_hash, "SNAP_HASH")),
    );
}
