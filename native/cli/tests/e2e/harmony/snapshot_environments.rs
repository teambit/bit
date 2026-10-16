//! Snapshot extension hooks retain data and source transformations without Node VCS writes.
mod build;
use crate::helper::{FOO_FIXTURE, Helper, config, parse};
use serde_json::{Value, json};
use std::ffi::OsStr;

fn workspace() -> Helper {
    let helper = Helper::new();
    helper.re_init_workspace();
    helper.create_component_bar_foo(FOO_FIXTURE);
    helper.add_component_bar_foo();
    helper
}

fn version(root: &std::path::Path) -> Value {
    let run = Helper::cmd_in_with(
        root,
        "cat-component bar/foo@latest --json",
        &[("BIT_NATIVE", OsStr::new("off"))],
    );
    assert!(run.status.success(), "{}", run.stderr);
    let mut value = parse(&run.stdout);
    value
        .as_object_mut()
        .unwrap()
        .remove("hash");
    value
        .as_object_mut()
        .unwrap()
        .remove("batchId");
    value["log"]
        .as_object_mut()
        .unwrap()
        .remove("date");
    for extension in value["extensions"].as_array_mut().unwrap() {
        if let Some(params) = extension
            .get_mut("data")
            .and_then(|data| data.get_mut("callbackParams"))
            .and_then(Value::as_object_mut)
            && params.contains_key("packageManagerConfigRootDir")
        {
            params.insert("packageManagerConfigRootDir".into(), json!("WORKSPACE_ROOT"));
        }
    }
    if let Some(reference) = value["flattenedEdgesRef"].as_str() {
        let graph = Helper::cmd_in_with(
            root,
            &format!("cat-object {reference} -s"),
            &[("BIT_NATIVE", OsStr::new("off"))],
        );
        assert!(graph.status.success(), "{}", graph.stderr);
        let bitmap = config::read_jsonc(&root.join(".bitmap"));
        let version = bitmap
            .as_object()
            .unwrap()
            .values()
            .find(|row| row["name"] == "bar/foo")
            .unwrap()["version"]
            .as_str()
            .unwrap();
        value["flattenedEdgesRef"] = parse(&graph.stdout.replace(version, "SNAP_HASH"));
    }
    value
}

#[test]
fn react_environment_snapshot_retains_actual_aspect_data() {
    let helper = workspace();
    config::set_component_env(&helper.scopes.local_path, "bar/foo", "teambit.react/react");
    let oracle = helper.clone_workspace();
    let node =
        Helper::cmd_in_with(&oracle, "snap bar/foo -m react", &[("BIT_NATIVE", OsStr::new("off"))]);
    assert!(node.status.success(), "{} {}", node.stdout, node.stderr);
    helper.native("snap bar/foo -m react");
    assert_eq!(version(&helper.scopes.local_path), version(&oracle));
}

const HOOK: &str = r"const {SnappingAspect}=require('@teambit/snapping');
const {WorkspaceAspect}=require('@teambit/workspace');
const {IssuesAspect}=require('@teambit/issues');
const fs=require('fs');
class Hook {
 static dependencies=[SnappingAspect,WorkspaceAspect,IssuesAspect];
 static async provider([snapping,workspace,issues]) {
  console.log('fixture provider startup');
  issues.registerAddComponentsIssues((components,ignored)=>console.log('fixture issue IDs '+components.map((component)=>component.id.fullName).join(',')+' ignored '+JSON.stringify(ignored)));
  workspace.registerOnComponentLoad((component)=>{
   if(component.id.fullName!=='bar/foo')return;
   console.log('fixture component load');
   if(fs.existsSync(workspace.path+'/checkout-load-fails')) {fs.appendFileSync(workspace.path+'/checkout-load-count','x');throw new Error('fixture checkout load rejected');}
   const file=component.state._consumer.files.find((file)=>file.relative==='foo.js');
   file.contents=Buffer.concat([file.contents,Buffer.from('\n// in-memory snapshot onLoad\n')]);
   return {snapshotAdapter:'loaded'};
  });
  snapping.registerOnPreSnap(async(components,automatic,params)=>{
   for(const component of components) {
    if(component.id.fullName!=='bar/foo')continue;
    const extension=component.state.config.extensions.findExtension('__ASPECT__',true);
    if(extension) extension.data.callbackParams=params;
    const file=component.state._consumer.files.find((file)=>file.relative==='foo.js');
    fs.appendFileSync(file.path,'\n// pre-snapshot physical callback\n');
    if(__FAIL__){console.log('fixture pre-snap side effect');throw new Error('fixture pre-snap rejected');}
   }
  });
  return new Hook();
 }
}
module.exports={default:Hook};";

pub(super) fn callback_workspace(fail: bool) -> Helper {
    let helper = workspace();
    let id = format!("{}/callbacks/hook", helper.scopes.remote);
    let source = HOOK
        .replace("__ASPECT__", &id)
        .replace("__FAIL__", if fail { "true" } else { "false" });
    helper.output_file("snapshot-hook/index.js", &source);
    helper.run("add snapshot-hook -i callbacks/hook");
    config::set_component_env(
        &helper.scopes.local_path,
        "callbacks/hook",
        "teambit.harmony/aspect",
    );
    helper.run("link");
    helper.output_file("snapshot-hook/dist/index.js", &source);
    helper.output_file(&format!("node_modules/.bit_roots/teambit.harmony_aspect/node_modules/@{}/callbacks.hook/dist/index.js",helper.scopes.remote),&source);
    let setup = Helper::cmd_in_with(
        &helper.scopes.local_path,
        "tag callbacks/hook -m hook",
        &[("BIT_NATIVE", OsStr::new("off"))],
    );
    assert!(setup.status.success(), "{} {}", setup.stdout, setup.stderr);
    config::set_workspace_key(&helper.scopes.local_path, &id, json!({}));
    helper.output_file("bar/component.json",&json!({"componentId":{"scope":helper.scopes.remote,"name":"bar/foo"},"extensions":{id:{}}}).to_string());
    helper
}

#[test]
fn presnap_physical_sources_and_custom_aspect_data_match_node() {
    let helper = callback_workspace(false);
    let oracle = helper.clone_workspace();
    let node = Helper::cmd_in_with(
        &oracle,
        "snap bar/foo --unmodified --skip-auto-snap -m callback",
        &[("BIT_NATIVE", OsStr::new("off"))],
    );
    assert!(node.status.success(), "{} {}", node.stdout, node.stderr);
    let native = helper.native_run("snap bar/foo --unmodified --skip-auto-snap -m callback");
    assert!(native.status.success(), "{} {}", native.stdout, native.stderr);
    assert_eq!(without_hashes(&native.stdout), without_hashes(&node.stdout));
    assert_eq!(
        std::fs::read(helper.scopes.local_path.join("bar/foo.js")).unwrap(),
        std::fs::read(oracle.join("bar/foo.js")).unwrap(),
    );
    assert_eq!(version(&helper.scopes.local_path), version(&oracle));
}

#[cfg(unix)]
#[test]
fn editor_messages_use_the_released_template_and_parser() {
    use std::os::unix::fs::PermissionsExt;
    let helper = workspace();
    helper.output_file("bin/vim","#!/bin/sh\nfor argument do filename=$argument; done\nsed -i 's/^DEFAULT: *$/DEFAULT: edited snapshot message/' \"$filename\"\n");
    let executable = helper.scopes.local_path.join("bin/vim");
    std::fs::set_permissions(&executable, std::fs::Permissions::from_mode(0o755)).unwrap();
    let paths = std::env::join_paths(
        std::iter::once(helper.scopes.local_path.join("bin"))
            .chain(std::env::split_paths(&std::env::var_os("PATH").unwrap())),
    )
    .unwrap();
    let oracle = helper.clone_workspace();
    let node = Helper::cmd_in_with(
        &oracle,
        "snap --editor vim",
        &[("BIT_NATIVE", OsStr::new("off")), ("PATH", paths.as_os_str())],
    );
    assert!(node.status.success(), "{} {}", node.stdout, node.stderr);
    let native = Helper::cmd_in_with(
        &helper.scopes.local_path,
        "snap --editor vim",
        &[("PATH", paths.as_os_str())],
    );
    assert!(native.native, "{}", native.trace);
    assert!(native.status.success(), "{} {}", native.stdout, native.stderr);
    assert_eq!(version(&helper.scopes.local_path), version(&oracle));
    let current = parse(&helper.run("cat-component bar/foo@latest --json"));
    assert_eq!(current["log"]["message"], "edited snapshot message");
}

#[test]
fn composition_source_callbacks_are_retained_in_the_snapshot() {
    let helper = workspace();
    helper.output_file(
        "bar/foo.composition.js",
        "export const Example = () => 'composition metadata';\n",
    );
    let oracle = helper.clone_workspace();
    let node =
        Helper::cmd_in_with(&oracle, "snap -m compositions", &[("BIT_NATIVE", OsStr::new("off"))]);
    assert!(node.status.success(), "{} {}", node.stdout, node.stderr);
    helper.native("snap -m compositions");
    assert_eq!(version(&helper.scopes.local_path), version(&oracle));
}

#[test]
fn failed_presnap_keeps_physical_changes_without_publishing_objects() {
    let helper = callback_workspace(true);
    let bitmap = std::fs::read(helper.scopes.local_path.join(".bitmap")).unwrap();
    let staged = std::fs::read(helper.scopes.local_path.join(".bit/staged-snaps")).unwrap();
    let oracle = helper.clone_workspace();
    let command = "snap bar/foo --ignore-issues MissingDists -m rejected";
    let node = Helper::cmd_in_with(&oracle, command, &[("BIT_NATIVE", OsStr::new("off"))]);
    assert!(!node.status.success(), "{} {}", node.stdout, node.stderr);
    let native = helper.native_run(command);
    assert!(!native.status.success(), "{} {}", native.stdout, native.stderr);
    assert_eq!(
        native.stdout, node.stdout,
        "native stderr: {}\nnode stderr: {}",
        native.stderr, node.stderr,
    );
    assert_eq!(native.stderr, node.stderr);
    assert_eq!(std::fs::read(helper.scopes.local_path.join(".bitmap")).unwrap(), bitmap);
    assert_eq!(std::fs::read(helper.scopes.local_path.join(".bit/staged-snaps")).unwrap(), staged);
    assert_eq!(
        std::fs::read(helper.scopes.local_path.join("bar/foo.js")).unwrap(),
        std::fs::read(oracle.join("bar/foo.js")).unwrap(),
    );
    assert_eq!(
        config::read_jsonc(&helper.scopes.local_path.join(".bitmap")),
        config::read_jsonc(&oracle.join(".bitmap")),
    );
}

#[test]
fn snapshot_accepts_global_aspect_configuration_and_cleans_temporary_workspace() {
    let helper = workspace();
    let home = helper.scopes.e2e_dir.join("snapshot-home");
    std::fs::create_dir(&home).unwrap();
    std::fs::write(
        home.join(".bitrc.jsonc"),
        r#"{"teambit.component/issues":{"ignoreIssues":["MissingDists"]}}"#,
    )
    .unwrap();
    helper.output_file(".bitTmp/sentinel", "stale workspace temporary file");
    let oracle = helper.clone_workspace();
    let environment = [("HOME", home.as_os_str()), ("USERPROFILE", home.as_os_str())];
    let node = Helper::cmd_in_with(
        &oracle,
        "snap -m global",
        &[("BIT_NATIVE", OsStr::new("off")), environment[0], environment[1]],
    );
    assert!(node.status.success(), "{} {}", node.stdout, node.stderr);
    let native = Helper::cmd_in_with(&helper.scopes.local_path, "snap -m global", &environment);
    assert!(native.native, "{}", native.trace);
    assert!(native.status.success(), "{} {}", native.stdout, native.stderr);
    assert!(!helper.scopes.local_path.join(".bitTmp").exists());
    assert!(!oracle.join(".bitTmp").exists());
    assert_eq!(version(&helper.scopes.local_path), version(&oracle));
}

#[test]
fn blocking_workspace_issues_prevent_snapshot_unless_all_issues_are_ignored() {
    let helper = workspace();
    helper.output_file(
        "merge-conflict",
        "[*] WORKSPACE\n<<<<<<< ours\n{}\n=======\n{}\n>>>>>>> theirs\n",
    );
    let bitmap = std::fs::read(helper.scopes.local_path.join(".bitmap")).unwrap();
    let oracle = helper.clone_workspace();
    let command = "snap -m workspace-conflict";
    let node = Helper::cmd_in_with(&oracle, command, &[("BIT_NATIVE", OsStr::new("off"))]);
    let native = helper.native_run(command);
    assert!(!node.status.success(), "{} {}", node.stdout, node.stderr);
    assert!(!native.status.success(), "{} {}", native.stdout, native.stderr);
    assert_eq!(native.stdout, node.stdout);
    assert_eq!(
        native.stderr.replace(&helper.scopes.local_path.display().to_string(), "WORKSPACE"),
        node.stderr.replace(&oracle.display().to_string(), "WORKSPACE"),
    );
    assert!(native.stderr.contains("the workspace has the following issues"));
    assert_eq!(std::fs::read(helper.scopes.local_path.join(".bitmap")).unwrap(), bitmap);
    assert_eq!(std::fs::read(oracle.join(".bitmap")).unwrap(), bitmap);
    let command = "snap --ignore-issues * -m workspace-conflict";
    let node = Helper::cmd_in_with(&oracle, command, &[("BIT_NATIVE", OsStr::new("off"))]);
    let native = helper.native_run(command);
    assert!(node.status.success(), "{} {}", node.stdout, node.stderr);
    assert!(native.status.success(), "{} {}", native.stdout, native.stderr);
    assert_eq!(version(&helper.scopes.local_path), version(&oracle));
}

fn without_hashes(output: &str) -> String {
    let mut normalized = output.to_owned();
    for token in output.split(|character: char| !character.is_ascii_hexdigit()) {
        if token.len() == 40 {
            normalized = normalized.replace(token, "HASH");
        }
    }
    normalized
}

#[test]
fn registered_application_metadata_is_retained_in_native_snapshots() {
    let helper = workspace();
    let source = "module.exports.default = {name:'native-fixture-app',applicationType:'fixture',run:async()=>({port:3000})};\n";
    helper.output_file("bar/fixture.bit-app.js", source);
    config::set_workspace_key(
        &helper.scopes.local_path,
        &format!("{}/bar/foo", helper.scopes.remote),
        json!({}),
    );
    helper.run("link");
    helper.output_file("bar/dist/fixture.bit-app.js", source);
    let oracle = helper.clone_workspace();
    let node =
        Helper::cmd_in_with(&oracle, "snap -m application", &[("BIT_NATIVE", OsStr::new("off"))]);
    assert!(node.status.success(), "{} {}", node.stdout, node.stderr);
    helper.native("snap -m application");
    assert_eq!(version(&helper.scopes.local_path), version(&oracle));
    let snapshot = version(&helper.scopes.local_path);
    assert!(
        snapshot["extensions"]
            .as_array()
            .unwrap()
            .iter()
            .any(|extension| extension["name"] == "teambit.harmony/application"
                && extension["data"]["appName"] == "native-fixture-app"),
    );
}

#[test]
fn tag_callback_bootstrap_and_component_output_match_node() {
    tag_callback_output("tag", &[]);
    tag_callback_output("t", &[]);
    tag_callback_output("tag", &[("CI", OsStr::new("1"))]);
    tag_callback_output("tag", &[("FORCE_COLOR", OsStr::new("1"))]);
}

fn tag_callback_output(alias: &str, environment: &[(&str, &OsStr)]) {
    let helper = callback_workspace(false);
    let oracle = helper.clone_workspace();
    let command = format!("{alias} bar/foo --unmodified --skip-auto-tag -m status");
    let mut oracle_environment = environment.to_vec();
    oracle_environment.push(("BIT_NATIVE", OsStr::new("off")));
    let node = Helper::cmd_in_with(&oracle, &command, &oracle_environment);
    let native = Helper::cmd_in_with(&helper.scopes.local_path, &command, environment);
    assert!(native.native, "{}", native.trace);
    assert!(node.status.success(), "{} {}", node.stdout, node.stderr);
    assert!(native.status.success(), "{} {}", native.stdout, native.stderr);
    assert_eq!(native.stdout, node.stdout, "alias {alias}, environment {environment:?}");
    assert_eq!(without_node_pid(&native.stderr), without_node_pid(&node.stderr));
    assert_eq!(version(&helper.scopes.local_path), version(&oracle));
}

fn without_node_pid(output: &str) -> String {
    output
        .split_inclusive('\n')
        .map(|line| {
            if let Some(warning) = line.strip_prefix("(node:")
                && let Some((pid, rest)) = warning.split_once(") Warning:")
                && pid.bytes().all(|byte| byte.is_ascii_digit())
            {
                format!("(node:PID) Warning:{rest}")
            } else {
                line.to_owned()
            }
        })
        .collect()
}
