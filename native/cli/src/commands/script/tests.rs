use super::{
    Options, fast_workspace_message, parse_options,
    parser::{ParsedScript, ScriptHandler, eval_function_logs, parse_scripts_from_source},
    runner::{execute, is_env_allowed},
};
use crate::commands::color::Chalk;
use std::fs;

#[test]
fn parses_script_options() {
    assert_eq!(parse_options(&["-l"]), Some(Options { script_name: None, list: true }));
    assert_eq!(
        parse_options(&["build-svg"]),
        Some(Options { script_name: Some("build-svg".into()), list: false }),
    );
    assert_eq!(parse_options(&[]), Some(Options { script_name: None, list: false }));
}

#[test]
fn detects_unconfigured_envs_and_empty_workspace() {
    let temp = tempfile::tempdir().unwrap();
    fs::write(
        temp.path().join("workspace.jsonc"),
        r#"{ "teambit.workspace/workspace": { "defaultScope": "my-scope" } }"#,
    )
    .unwrap();
    fs::write(temp.path().join(".bitmap"), "{}").unwrap();

    let msg = fast_workspace_message(temp.path(), Chalk::new(false)).unwrap().unwrap();
    assert!(msg.contains("no envs configured"), "{msg}");

    fs::write(
        temp.path().join("workspace.jsonc"),
        r#"{
            "teambit.workspace/workspace": { "defaultScope": "my-scope" },
            "teambit.workspace/scripts": { "envs": ["my-scope/my-env"] }
        }"#,
    )
    .unwrap();
    let empty_msg = fast_workspace_message(temp.path(), Chalk::new(false)).unwrap().unwrap();
    assert_eq!(empty_msg, "no components found");
}

#[test]
fn parses_scripts_from_bit_env_source_and_evaluates_logs() {
    let src = r"
import { Scripts } from '@teambit/scripts';
export class EnvWithScripts {
  name = 'env-with-scripts';
  scripts() {
    return Scripts.from({
      'test-script': 'echo hello from script',
      'another-script': 'echo another output',
      'async-script': async (context) => {
        return new Promise((resolve) => {
          setTimeout(() => {
            console.log('async script executed');
            console.log(`executed for ${context?.components.length || 0} component(s)`);
            resolve();
          }, 100);
        });
      },
    });
  }
}
export default new EnvWithScripts();
";
    let parsed = parse_scripts_from_source(src);
    assert!(parsed.has_scripts_method);
    assert_eq!(parsed.scripts.len(), 3);
    assert_eq!(
        parsed.scripts[0],
        ParsedScript {
            name: "test-script".into(),
            handler: ScriptHandler::Shell("echo hello from script".into()),
        },
    );
    assert_eq!(
        parsed.scripts[1],
        ParsedScript {
            name: "another-script".into(),
            handler: ScriptHandler::Shell("echo another output".into()),
        },
    );
    let ScriptHandler::Function(body) = &parsed.scripts[2].handler else {
        panic!("expected function handler");
    };
    let logs = eval_function_logs(body, 3);
    assert_eq!(logs, vec!["async script executed", "executed for 3 component(s)"]);
}

#[test]
fn checks_env_version_matching() {
    let unversioned = vec!["my-scope/my-env".to_owned()];
    assert!(is_env_allowed("my-scope/my-env", &unversioned));
    assert!(is_env_allowed("my-scope/my-env@0.0.1", &unversioned));

    let versioned = vec!["my-scope/my-env@0.0.1".to_owned()];
    assert!(is_env_allowed("my-scope/my-env@0.0.1", &versioned));
    assert!(!is_env_allowed("my-scope/my-env", &versioned));
    assert!(!is_env_allowed("my-scope/my-env@0.0.2", &versioned));
}

#[test]
fn executes_list_and_run_in_workspace() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path();
    fs::create_dir_all(root.join("env-with-scripts")).unwrap();
    fs::create_dir_all(root.join("comp1")).unwrap();
    fs::write(
        root.join("env-with-scripts/env-with-scripts.bit-env.ts"),
        "import { Scripts } from '@teambit/scripts';\n\
         export class EnvWithScripts {\n\
           scripts() {\n\
             return Scripts.from({\n\
               'test-script': 'echo hello from script',\n\
             });\n\
           }\n\
         }\n",
    )
    .unwrap();
    fs::write(root.join("comp1/index.js"), "module.exports = () => 'hi';\n").unwrap();
    fs::write(
        root.join("workspace.jsonc"),
        r#"{
            "teambit.workspace/workspace": { "defaultScope": "my-scope" },
            "teambit.workspace/scripts": { "envs": ["my-scope/env-with-scripts"] },
            "teambit.workspace/variants": {
                "env-with-scripts": { "teambit.envs/env": {} },
                "comp1": { "my-scope/env-with-scripts": {} }
            }
        }"#,
    )
    .unwrap();
    fs::write(
        root.join(".bitmap"),
        r#"{
            "env-with-scripts": {
                "scope": "",
                "version": "",
                "mainFile": "env-with-scripts.bit-env.ts",
                "rootDir": "env-with-scripts"
            },
            "comp1": {
                "scope": "",
                "version": "",
                "mainFile": "index.js",
                "rootDir": "comp1"
            }
        }"#,
    )
    .unwrap();

    let list_out =
        execute(root, &Options { script_name: None, list: true }, Chalk::new(false)).ok().unwrap();
    assert!(list_out.contains("Available scripts"), "{list_out}");
    assert!(list_out.contains("my-scope/env-with-scripts"), "{list_out}");
    assert!(list_out.contains("test-script: echo hello from script"), "{list_out}");

    let run_out = execute(
        root,
        &Options { script_name: Some("test-script".into()), list: false },
        Chalk::new(false),
    )
    .ok()
    .unwrap();
    assert!(run_out.contains(r#"Running script "test-script""#), "{run_out}");
    assert!(run_out.contains("hello from script"), "{run_out}");
}
