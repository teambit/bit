//! Environment policies, dev-file callbacks and diagnostics retain Node parity.

use crate::helper::{FOO_FIXTURE, Helper, parse};
use serde_json::{Value, json};
use std::ffi::OsStr;

fn workspace() -> Helper {
    let helper = Helper::new();
    helper.re_init_workspace();
    helper.create_component_bar_foo(FOO_FIXTURE);
    helper.add_component_bar_foo();
    helper
}

fn configure(helper: &Helper, extensions: &Value) {
    helper.output_file("bar/component.json", &json!({
        "componentId":{"scope":helper.scopes.remote,"name":"bar/foo"},"propagate":true,"extensions":extensions
    }).to_string());
}

/// Exact `.bitmap` projection of the released `env set`, without registry lookups in setup.
fn set_env(helper: &Helper, component: &str, env: &str) {
    crate::helper::config::set_component_env(&helper.scopes.local_path, component, env);
}

fn parity(helper: &Helper, command: &str) -> Value {
    let copy = helper.clone_workspace();
    let native = helper.native_run(command);
    helper.get_cloned_workspace(&copy);
    let node = Helper::cmd_in_with(
        &helper.scopes.local_path,
        command,
        &[("BIT_NATIVE", OsStr::new("off"))],
    );
    assert_eq!(
        native.status.code(),
        node.status.code(),
        "{command}: native stdout: {}\nnative stderr: {}\nNode stdout: {}\nNode stderr: {}",
        native.stdout,
        native.stderr,
        node.stdout,
        node.stderr,
    );
    assert_eq!(stderr(&native.stderr), stderr(&node.stderr), "{command}");
    let (native_prefix, native_json) = json_output(&native.stdout);
    let (node_prefix, node_json) = json_output(&node.stdout);
    assert_eq!(native_prefix, node_prefix, "{command} callback stdout");
    let result = parse(native_json);
    assert_eq!(result, parse(node_json), "{command}");
    result
}

fn json_output(output: &str) -> (&str, &str) {
    let offset = output.find(['[', '{']).unwrap();
    output.split_at(offset)
}

fn text_parity(helper: &Helper, command: &str, color: &str) {
    let copy = helper.clone_workspace();
    let native = Helper::cmd_in_with(
        &helper.scopes.local_path,
        command,
        &[("FORCE_COLOR", OsStr::new(color))],
    );
    assert!(native.native, "{}", native.trace);
    helper.get_cloned_workspace(&copy);
    let node = Helper::cmd_in_with(
        &helper.scopes.local_path,
        command,
        &[("FORCE_COLOR", OsStr::new(color)), ("BIT_NATIVE", OsStr::new("off"))],
    );
    assert_eq!(
        native.status.code(),
        node.status.code(),
        "{command} color={color}: native stdout: {}\nnative stderr: {}\nNode stdout: {}\nNode stderr: {}",
        native.stdout,
        native.stderr,
        node.stdout,
        node.stderr,
    );
    assert_eq!(stderr(&native.stderr), stderr(&node.stderr));
    assert_eq!(native.stdout, node.stdout, "{command} color={color}");
}

#[test]
fn react_environment_status_and_diff_match_node() {
    let helper = workspace();
    helper.tag_component_bar_foo();
    configure(
        &helper,
        &json!({"teambit.envs/envs":{"env":"teambit.react/react"},"teambit.react/react":{}}),
    );
    parity(&helper, "status --json");
    parity(&helper, "diff bar/foo --json");
}

#[test]
fn multiple_core_environments_match_node_diagnostics() {
    let helper = workspace();
    helper.tag_component_bar_foo();
    configure(&helper, &json!({"teambit.react/react":{},"teambit.harmony/node":{}}));
    let status = parity(&helper, "status --json");
    assert!(status.to_string().contains("MultipleEnvs"));
}

fn custom_workspace(source: &str, compiled: bool, manifest: Option<Value>) -> Helper {
    let helper = workspace();
    if compiled {
        helper.tag_component_bar_foo();
    }
    helper.output_file("custom-env/index.js", source);
    if let Some(manifest) = manifest {
        helper.output_file("custom-env/env.jsonc", &manifest.to_string());
    }
    helper.run("add custom-env -i env/custom");
    set_env(&helper, "env/custom", "teambit.envs/env");
    if compiled {
        helper.run("link");
        helper.output_file("custom-env/dist/index.js", source);
    }
    set_env(&helper, "bar/foo", &format!("{}/env/custom", helper.scopes.remote));
    helper
}

#[test]
fn uncompiled_workspace_environment_matches_node_diagnostics() {
    let helper = custom_workspace("module.exports = {};\n", false, None);
    let status = parity(&helper, "status --json");
    assert!(status.to_string().contains("NonLoadedEnv"));
}

#[test]
fn environment_manifest_policy_matches_node() {
    let helper = custom_workspace(
        "module.exports = {};\n",
        false,
        Some(json!({
            "policy":{"peers":[{"name":"env-peer","version":"^1.0.0","supportedRange":"^1.0.0 || ^2.0.0"}],
                "runtime":[{"name":"env-runtime","version":"^3.0.0","force":true}]},
            "patterns":{"tests":["**/*.custom.js"]}
        })),
    );
    parity(&helper, "status --json");
    parity(&helper, "diff bar/foo --json");
}

const CUSTOM_ENV_SOURCE: &str = r"const { EnvsAspect } = require('@teambit/envs');
const { NodeAspect } = require('@teambit/node');
class CustomEnv {
  static dependencies = [EnvsAspect, NodeAspect];
  static async provider([envs, node]) {
    const env = node.compose([]);
    env.getDependencies = () => ({dependencies:{'env-only-package':'^2.0.0'}});
    env.getDevPatterns = () => ['**/*.custom.js'];
    env.getDepDetectors = () => [{isSupported:({filename})=>filename.endsWith('.opaque'),detect:()=>['custom-detector-package']}];
    envs.registerEnv(env);
    return new CustomEnv();
  }
}
module.exports = {default:CustomEnv};
";

#[test]
fn custom_environment_callbacks_match_status_and_diff() {
    let helper = custom_workspace(CUSTOM_ENV_SOURCE, true, None);
    helper.output_file("bar/source.opaque", "custom syntax outside builtin scanners");
    helper.output_file("bar/sample.custom.js", "require('dev-pattern-package');");
    let status = parity(&helper, "status --json").to_string();
    assert!(status.contains("custom-detector-package"), "custom detector did not run: {status}");
    assert!(status.contains("dev-pattern-package"));
    assert!(status.contains(r#""isDevFile":true"#));
    let diff = parity(&helper, "diff bar/foo --json");
    assert!(
        diff.to_string().contains("env-only-package"),
        "environment policy missing from metadata: {diff}",
    );
}

fn stderr(stderr: &str) -> String {
    stderr
        .lines()
        .map(|line| {
            line.strip_prefix("(node:")
                .and_then(|line| line.split_once(") "))
                .map_or_else(|| line.to_owned(), |(_, message)| format!("(node:<pid>) {message}"))
        })
        .collect::<Vec<_>>()
        .join("\n")
}

const CUSTOM_CALLBACK_SOURCE: &str = r#"const { WorkspaceAspect } = require('@teambit/workspace');
const { IssuesAspect } = require('@teambit/issues');
// Use the workspace's actual released IssuesList class, without adding a remote Bit dependency.
function parseIssue(component) {
  const issues = component.state.issues;
  let issue = issues.getIssueByName('ParseErrors');
  if (!issue) {
    issue = issues.constructor.deserialize([{type:'ParseErrors',data:'{}'}]).getIssueByName('ParseErrors');
    issues.add(issue);
  }
  return issue;
}
class CallbackAspect {
  static dependencies = [WorkspaceAspect, IssuesAspect];
  static async provider([workspace, issues]) {
    console.log("callback provider startup");
    workspace.registerOnComponentLoad((component) => {
      if (component.id.fullName !== 'bar/foo') return;
      console.log('callback component load');
      parseIssue(component).formatSolution = () => 'callback dynamic solution';
      const source = component.state._consumer.files.find((file) => file.relative === 'foo.js');
      source.contents = Buffer.concat([source.contents, Buffer.from('\n// callback transformed source\n')]);
      const generated = source.clone();
      generated.updatePaths({newRelative:'generated.js'});
      generated.contents = Buffer.from('module.exports = "callback generated source";\n');
      component.state._consumer.files = component.state._consumer.files.filter((file) => file.relative !== 'removed.js');
      if (!component.state._consumer.files.some((file) => file.relative === 'generated.js')) component.state._consumer.files.push(generated);
      component.state._consumer.packageDependencies['callback-package'] = '^4.0.0';
      return { adapterProof: 'hydrated-source-and-state' };
    });
    issues.registerAddComponentsIssues((components) => {
      for (const component of components) {
        if (component.id.fullName !== 'bar/foo') continue;
        const aspect = component.state.aspects.get('__ASPECT__');
        if (aspect?.data.adapterProof === 'hydrated-source-and-state') {
          console.log('callback component issues');
          const issue = parseIssue(component);
          issue.data = {'callback.js':'custom issue callback'};

        }
      }
    });
    return new CallbackAspect();
  }
}
module.exports = {default:CallbackAspect};
"#;

fn callback_workspace() -> Helper {
    let helper = workspace();
    helper.output_file("bar/removed.js", "module.exports = 'original file';");
    helper.run("add bar -i bar/foo");
    helper.tag_component_bar_foo();
    let id = format!("{}/callbacks/hook", helper.scopes.remote);
    let source = CUSTOM_CALLBACK_SOURCE.replace("__ASPECT__", &id);
    helper.output_file("custom-hook/index.js", &source);
    helper.run("add custom-hook -i callbacks/hook");
    set_env(&helper, "callbacks/hook", "teambit.harmony/aspect");
    helper.run("link");
    helper.output_file("custom-hook/dist/index.js", &source);
    helper.output_file(&format!("node_modules/.bit_roots/teambit.harmony_aspect/node_modules/@{}/callbacks.hook/dist/index.js", helper.scopes.remote), &source);
    crate::helper::config::set_workspace_key(&helper.scopes.local_path, &id, json!({}));
    configure(&helper, &json!({id:{}}));
    helper
}

#[test]
fn custom_aspect_load_and_issue_callbacks_match_node() {
    let helper = callback_workspace();
    let oracle_copy = helper.clone_workspace();
    let oracle = Helper::cmd_in_with(
        &helper.scopes.local_path,
        "diff bar/foo --json",
        &[("BIT_NATIVE", OsStr::new("off"))],
    );
    assert!(oracle.status.success(), "{}", oracle.stderr);
    assert!(oracle.stdout.contains("callback transformed source"), "{}", oracle.stdout);
    helper.get_cloned_workspace(&oracle_copy);
    parity(&helper, "status --quick --json");
    let status = parity(&helper, "status --json");
    assert!(status.to_string().contains("custom issue callback"));
    let diff = parity(&helper, "diff bar/foo --json");
    assert!(diff.to_string().contains("callback-package"));
    assert!(diff.to_string().contains("callback transformed source"));
    assert!(diff.to_string().contains("generated.js"));
    assert!(diff.to_string().contains("removed.js"));
    assert!(!helper.scopes.local_path.join("bar/generated.js").exists());
    assert!(helper.scopes.local_path.join("bar/removed.js").exists());
    assert!(
        !std::fs::read_to_string(helper.scopes.local_path.join("bar/foo.js"))
            .unwrap()
            .contains("callback transformed source"),
    );
    for color in ["0", "1"] {
        text_parity(&helper, "status --quick", color);
        text_parity(&helper, "status", color);
        text_parity(&helper, "diff bar/foo", color);
    }
}

#[test]
fn missing_workspace_policy_package_matches_node() {
    let helper = workspace();
    crate::helper::config::set_workspace_key(
        &helper.scopes.local_path,
        "teambit.dependencies/dependency-resolver",
        json!({"policy":{"dependencies":{"missing-policy-package":"1.2.3"}}}),
    );
    helper.output_file("bar/foo.js", "require('missing-policy-package');");
    let status = parity(&helper, "status --json");
    assert!(status.to_string().contains("MissingPackagesDependenciesOnFs"));
}
