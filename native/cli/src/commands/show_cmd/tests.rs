use super::{
    Options, missing_host_error, parse_options,
    render::{harmony_json, legacy_json, text_report},
    workspace_show::{TargetOutcome, load_target_outcome},
};
use serde_json::json;
use std::{fs, path::Path};

#[test]
fn parses_show_options_and_detects_missing_host_errors() {
    assert_eq!(parse_options(&[]), None);
    let opts = parse_options(&["comp1", "-j", "-r", "-c"]).unwrap();
    assert_eq!(
        opts,
        Options {
            id: "comp1".into(),
            json: true,
            legacy: false,
            remote: true,
            browser: false,
            compare: true,
        },
    );
    let temp = tempfile::tempdir().unwrap();
    assert!(missing_host_error(temp.path(), &opts).unwrap().contains("--legacy"));
    let local_opts = parse_options(&["comp1"]).unwrap();
    assert!(
        missing_host_error(temp.path(), &local_opts).unwrap().contains("Consider using --remote"),
    );
}

fn write_fixture_workspace(root: &Path) {
    let ws_json = json!({
        "teambit.workspace/workspace": { "defaultScope": "my-scope" },
        "teambit.workspace/variants": {
            "*": { "teambit.pkg/pkg": { "packageJson": { "private": true } } },
        },
    });
    let bitmap_json = json!({
        "comp1": {
            "scope": "",
            "version": "",
            "mainFile": "index.js",
            "rootDir": "comp1",
            "config": {
                "teambit.dependencies/dependency-resolver": {
                    "policy": {
                        "dependencies": {
                            "is-positive": { "optional": true, "version": "1.0.0" },
                        },
                    },
                },
            },
        },
    });
    fs::write(root.join("workspace.jsonc"), serde_json::to_string_pretty(&ws_json).unwrap())
        .unwrap();
    fs::write(root.join(".bitmap"), serde_json::to_string_pretty(&bitmap_json).unwrap()).unwrap();
    fs::create_dir_all(root.join("comp1")).unwrap();
    fs::write(root.join("comp1/index.js"), "import { a } from '@my-scope/comp1';\n").unwrap();
}

#[test]
fn renders_legacy_harmony_and_text_for_workspace_component() {
    let temp = tempfile::tempdir().unwrap();
    write_fixture_workspace(temp.path());

    let opts = parse_options(&["comp1", "--json", "--legacy"]).unwrap();
    let TargetOutcome::Loaded(loaded) = load_target_outcome(temp.path(), &opts) else {
        panic!("fixture component should load");
    };
    let legacy = legacy_json(&loaded);
    assert_eq!(legacy["name"], "comp1");
    assert_eq!(
        legacy["dependencies"]
            .as_array()
            .unwrap()
            .len(),
        0,
    );
    assert_eq!(legacy["packageProperties"]["private"], json!(true));

    let harmony = harmony_json(&loaded);
    assert!(harmony.is_array());
    assert!(harmony.to_string().contains("comp1"));

    let text = text_report(&loaded);
    assert!(text.contains("is-positive@1.0.0 (optional)"), "{text}");
}
