//! Detached stash metadata and bytes remain independent of model/head publication.
mod history;
mod proof;
mod unversioned;
use super::support::{command, compare_stashes, controls, node, workspace};
use crate::helper::{Helper, config};
use serde_json::{Value, json};
use std::{
    fs,
    io::Read,
    path::{Path, PathBuf},
};

#[test]
fn stash_graph_keeps_current_ids_and_omits_unpublished_graph_sources() {
    let helper = workspace();
    helper.output_file("comp2/index.js", "module.exports='base';\n");
    helper.run("add comp2");
    successful_node(&helper.scopes.local_path, "tag comp2 --message dependency");
    successful_node(&helper.scopes.local_path, "compile");
    let oracle = helper.clone_workspace();
    let before = controls(&helper.scopes.local_path);
    for root in [&helper.scopes.local_path, &oracle] {
        fs::write(
            root.join("comp1/index.js"),
            format!(
                "const dependency=require('@{}/comp2');\nconsole.log(dependency);\n",
                helper.scopes.remote,
            ),
        )
        .unwrap();
        fs::write(root.join("comp2/index.js"), "module.exports='stashed';\n").unwrap();
    }
    command(&helper, &oracle, "stash save --message graph");
    compare_stashes(&helper.scopes.local_path, &oracle);
    let versions = detached_versions(&helper.scopes.local_path);
    let first = &versions["comp1"];
    assert_eq!(first["dependencies"][0]["id"]["version"], "0.0.1");
    assert_eq!(first["flattenedDependencies"][0]["name"], "comp2");
    assert_eq!(first["flattenedDependencies"][0]["version"], "0.0.1");
    let reference = first["flattenedEdgesRef"].as_str().unwrap();
    assert!(!object_path(&helper.scopes.local_path, reference).exists());
    assert!(!object_path(&oracle, reference).exists());
    assert_eq!(controls(&helper.scopes.local_path), before);
    command(&helper, &oracle, "stash load");
    for name in ["comp1/index.js", "comp2/index.js"] {
        assert_eq!(
            fs::read(helper.scopes.local_path.join(name)).unwrap(),
            fs::read(oracle.join(name)).unwrap(),
        );
    }
}

#[test]
fn stash_binary_and_crlf_sources_match_published_storage_and_restoration() {
    let helper = workspace();
    fs::write(helper.scopes.local_path.join("comp1/payload.bin"), b"\0\xffbase\r\n\x80").unwrap();
    helper.run("add comp1");
    successful_node(&helper.scopes.local_path, "tag comp1 --message binary");
    let oracle = helper.clone_workspace();
    let before = controls(&helper.scopes.local_path);
    for root in [&helper.scopes.local_path, &oracle] {
        fs::write(
            root.join("comp1/index.js"),
            b"console.log('CRLF');\r\nconsole.log('second');\r\n",
        )
        .unwrap();
        fs::write(root.join("comp1/payload.bin"), b"\0\xffstashed\r\n\x80\r\n").unwrap();
    }
    command(&helper, &oracle, "stash save");
    compare_stashes(&helper.scopes.local_path, &oracle);
    assert_eq!(controls(&helper.scopes.local_path), before);
    command(&helper, &oracle, "stash load");
    for name in ["comp1/index.js", "comp1/payload.bin"] {
        assert_eq!(
            fs::read(helper.scopes.local_path.join(name)).unwrap(),
            fs::read(oracle.join(name)).unwrap(),
        );
    }
}

const SCALAR_HOOK: &str = r"const {WorkspaceAspect}=require('@teambit/workspace');
const fs=require('fs');
class Hook {
 static dependencies=[WorkspaceAspect];
 static async provider([workspace]) {
  workspace.registerOnComponentLoad((component)=>{
   if(component.id.fullName!=='bar/foo'||!fs.existsSync(workspace.path+'/stash-scalar-enabled'))return;
   const consumer=component.state._consumer;
   consumer.log={message:'onLoad stash log',date:'1234567890000',username:'hook',email:'hook@example.test'};
   consumer.docs=[{name:'stash-onload',description:'retained scalar metadata'}];
   consumer.buildStatus='succeed';
   consumer.packageJsonChangedProps={fixture:'stash-scalar'};
   return {retainedScalar:true};
  });
  return new Hook();
 }
}
module.exports={default:Hook};";

#[test]
fn configured_onload_scalar_metadata_survives_detached_version_publication() {
    let helper = super::super::snapshot_environments::callback_workspace(false);
    scalar_hook(&helper);
    successful_node(&helper.scopes.local_path, "tag --message baseline");
    let baseline = node(&helper.scopes.local_path, "cat-component bar/foo@latest --json");
    assert!(baseline.status.success(), "{}", baseline.stderr);
    let baseline: Value = serde_json::from_str(&baseline.stdout).unwrap();
    let (actual, expected) = relocated_pair(&helper);
    for root in [&actual, &expected] {
        fs::write(root.join("stash-scalar-enabled"), "enabled").unwrap();
        fs::write(root.join("bar/foo.js"), "module.exports='stashed scalar metadata';\n").unwrap();
    }
    compare_command(&actual, &expected, "stash save");
    compare_stashes(&actual, &expected);
    let versions = detached_versions(&actual);
    let version = &versions["bar/foo"];
    assert_eq!(version["log"], baseline["log"]);
    assert_eq!(
        version["docs"],
        json!([{"name":"stash-onload","description":"retained scalar metadata"}]),
    );
    assert_eq!(version["log"], detached_versions(&expected)["bar/foo"]["log"]);
    assert_eq!(version["buildStatus"], "succeed");
    assert_eq!(version["packageJsonChangedProps"], json!({"fixture":"stash-scalar"}));
}

fn scalar_hook(helper: &Helper) {
    helper.output_file("snapshot-hook/dist/index.js", SCALAR_HOOK);
    helper.output_file(&format!("node_modules/.bit_roots/teambit.harmony_aspect/node_modules/@{}/callbacks.hook/dist/index.js",helper.scopes.remote),SCALAR_HOOK);
}
fn relocated_pair(helper: &Helper) -> (PathBuf, PathBuf) {
    (helper.clone_workspace(), helper.clone_workspace())
}
fn compare_command(actual: &Path, expected: &Path, command: &str) {
    let actual_run = Helper::cmd_in_with(actual, command, &[]);
    let expected_run = node(expected, command);
    assert!(actual_run.native, "{}", actual_run.trace);
    assert_eq!(
        actual_run.status.code(),
        expected_run.status.code(),
        "{} {}",
        actual_run.stderr,
        expected_run.stderr,
    );
    assert_eq!(actual_run.stdout, expected_run.stdout);
    assert_eq!(actual_run.stderr, expected_run.stderr);
    assert_eq!(super::support::history(actual), super::support::history(expected));
    assert_eq!(
        config::read_jsonc(&actual.join(".bitmap")),
        config::read_jsonc(&expected.join(".bitmap")),
    );
}
fn successful_node(root: &Path, command: &str) {
    let run = node(root, command);
    assert!(run.status.success(), "{command}: {} {}", run.stdout, run.stderr);
}
fn detached_versions(root: &Path) -> Value {
    let metadata: Value = serde_json::from_slice(
        &fs::read(bit_object_import::scope_path(root).join("stash/stash-1.json")).unwrap(),
    )
    .unwrap();
    let mut versions = serde_json::Map::new();
    for row in metadata["stashCompsData"].as_array().unwrap() {
        let version = read_object(root, row["hash"].as_str().unwrap());
        versions.insert(
            row["id"]["name"]
                .as_str()
                .unwrap()
                .into(),
            version,
        );
    }
    Value::Object(versions)
}
fn object_path(root: &Path, hash: &str) -> PathBuf {
    bit_object_import::scope_path(root)
        .join("objects")
        .join(&hash[..2])
        .join(&hash[2..])
}
fn read_object(root: &Path, hash: &str) -> Value {
    let packed = fs::read(object_path(root, hash)).unwrap();
    let mut bytes = Vec::new();
    flate2::read::ZlibDecoder::new(packed.as_slice()).read_to_end(&mut bytes).unwrap();
    let separator = bytes
        .iter()
        .position(|byte| *byte == 0)
        .unwrap();
    assert!(std::str::from_utf8(&bytes[..separator]).unwrap().starts_with("Version "));
    serde_json::from_slice(&bytes[separator + 1..]).unwrap()
}
