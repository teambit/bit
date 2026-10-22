use super::{
    Options,
    extractor::{
        ArtifactFile, ArtifactItem, ComponentArtifacts, filter_artifacts, parse_builder_artifacts,
    },
    is_empty_workspace, parse_options,
    render::render_artifacts_report,
};
use crate::commands::{color::Chalk, workspace_command::format::Formatter};
use serde_json::json;
use std::fs;

#[test]
fn parses_artifacts_options() {
    assert_eq!(parse_options(&[]), None);
    assert_eq!(
        parse_options(&[
            "comp1",
            "--aspect",
            "teambit.compilation/compiler",
            "--task=compile",
            "--files",
            "dist/**",
            "--out-dir",
            "out",
        ]),
        Some(Options {
            pattern: "comp1".into(),
            aspect: Some("teambit.compilation/compiler".into()),
            task: Some("compile".into()),
            files: Some("dist/**".into()),
            out_dir: Some("out".into()),
        }),
    );
}

#[test]
fn detects_empty_workspace_for_artifacts() {
    let temp = tempfile::tempdir().unwrap();
    fs::write(
        temp.path().join("workspace.jsonc"),
        r#"{ "teambit.workspace/workspace": { "defaultScope": "my-scope" } }"#,
    )
    .unwrap();
    fs::write(temp.path().join(".bitmap"), "{}").unwrap();
    assert!(is_empty_workspace(temp.path()).unwrap());
}

#[test]
fn extracts_filters_and_renders_builder_artifacts() {
    let ver_val = json!({
        "extensions": [
            {
                "name": "teambit.pipelines/builder",
                "data": {
                    "artifacts": [
                        {
                            "name": "dist",
                            "generatedBy": "teambit.compilation/compiler",
                            "task": {
                                "id": "teambit.compilation/compiler",
                                "name": "TSCompiler"
                            },
                            "files": {
                                "refs": [
                                    { "relativePath": "dist/index.js", "ref": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
                                    { "relativePath": "dist/index.d.ts", "ref": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" }
                                ]
                            }
                        }
                    ]
                }
            }
        ]
    });
    let mut artifacts = parse_builder_artifacts(&ver_val);
    assert_eq!(
        artifacts,
        vec![ArtifactItem {
            artifact_name: "dist".into(),
            aspect_id: "teambit.compilation/compiler".into(),
            task_name: "TSCompiler".into(),
            files: vec![
                ArtifactFile {
                    relative_path: "dist/index.js".into(),
                    hash: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa".into(),
                },
                ArtifactFile {
                    relative_path: "dist/index.d.ts".into(),
                    hash: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb".into(),
                },
            ],
        }],
    );

    let opts = Options {
        pattern: "comp1".into(),
        aspect: Some("teambit.compilation/compiler".into()),
        task: Some("TSCompiler".into()),
        files: Some("dist/*.js".into()),
        out_dir: None,
    };
    filter_artifacts(&mut artifacts, &opts).unwrap();
    assert_eq!(artifacts[0].files.len(), 1);
    assert_eq!(artifacts[0].files[0].relative_path, "dist/index.js");

    let formatter = Formatter::new(Chalk::new(false));
    let comp = ComponentArtifacts {
        identity_no_ver: "my-scope/comp1".into(),
        display_id: "my-scope/comp1@0.0.1".into(),
        artifacts,
    };
    let report = render_artifacts_report(&[comp], "comp1", None, 0, &formatter);
    assert!(report.contains("my-scope/comp1@0.0.1"));
    assert!(report.contains("teambit.compilation/compiler"));
    assert!(report.contains("TSCompiler (dist)"));
    assert!(report.contains("dist/index.js"));
}
