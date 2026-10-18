use super::{Options, Plan};
use serde_json::{Value, json};
use std::{fs, io};

fn fixture() -> (tempfile::TempDir, Options, Value) {
    let directory = tempfile::tempdir().unwrap();
    let root = directory.path();
    fs::create_dir(root.join("original")).unwrap();
    fs::write(root.join("original/source.js"), "module.exports = 'source old.scope/source';")
        .unwrap();
    fs::write(root.join("workspace.jsonc"),r#"{"teambit.workspace/workspace":{"defaultScope":"new.scope","defaultDirectory":"components/{name}"}}"#).unwrap();
    fs::write(root.join(".bitmap"),r#"{"source":{"name":"source","scope":"old.scope","version":"0.0.1","rootDir":"original","mainFile":"source.js"}}"#).unwrap();
    let options = Options {
        source: "old.scope/source".into(),
        target: Some("target".into()),
        ..Options::default()
    };
    let source = json!({"identity":"old.scope/source","version":"0.0.1","rootDir":"original","mainFile":"source.js","files":["source.js"],"sourceConfigs":{"teambit.pkg/pkg":{"name":"ignored"},"custom/aspect":{"enabled":true}}});
    (directory, options, source)
}
#[test]
fn local_fork_preserves_source_names_bytes_and_original_bitmap_entry() {
    let (directory, options, source) = fixture();
    let root = directory.path();
    let original = fs::read(root.join("original/source.js")).unwrap();
    let mut plan = Plan::prepare(root, &options, &source).unwrap();
    assert_eq!(plan.target_identity(), "new.scope/target");
    assert_eq!(plan.bitmap()["source"]["version"], "0.0.1");
    assert_eq!(plan.bitmap()["target"]["mainFile"], "source.js");
    assert!(plan.bitmap()["target"]["config"].get("teambit.pkg/pkg").is_none());
    assert_eq!(
        plan.bitmap()["target"]["config"]["teambit.component/forking"]["forkedFrom"]["version"],
        "0.0.1",
    );
    plan.apply_files().unwrap();
    assert_eq!(fs::read(root.join("components/target/source.js")).unwrap(), original);
    assert_eq!(fs::read(root.join("original/source.js")).unwrap(), original);
}
#[test]
fn remote_fork_refactors_id_names_and_filename_while_preserve_only_keeps_names() {
    let (directory, mut options, source) = fixture();
    options.remote = true;
    let mut plan = Plan::prepare(directory.path(), &options, &source).unwrap();
    assert_eq!(plan.bitmap()["target"]["mainFile"], "target.js");
    plan.apply_files().unwrap();
    assert_eq!(
        fs::read(directory.path().join("components/target/target.js")).unwrap(),
        b"module.exports = 'target new.scope/target';",
    );
}
#[test]
fn changed_source_and_changed_workspace_prevent_any_copy() {
    let (directory, options, source) = fixture();
    let mut plan = Plan::prepare(directory.path(), &options, &source).unwrap();
    fs::write(directory.path().join("original/source.js"), "changed").unwrap();
    assert!(plan.apply_files().is_err());
    assert!(
        !directory
            .path()
            .join("components")
            .exists(),
    );
}
#[test]
fn occupied_target_is_rejected_before_bitmap_or_sources_change() {
    let (directory, options, source) = fixture();
    fs::create_dir_all(directory.path().join("components/target")).unwrap();
    fs::write(directory.path().join("components/target/keep"), "occupied").unwrap();
    let error = Plan::prepare(directory.path(), &options, &source).err().unwrap();
    assert_eq!(error.kind(), io::ErrorKind::InvalidInput);
    assert!(error.to_string().contains("this directory is not empty"));
}

#[test]
fn stale_workspace_control_rejects_copy_before_any_target_is_written() {
    let (directory, options, source) = fixture();
    let before = fs::read(directory.path().join(".bitmap")).unwrap();
    let mut plan = Plan::prepare(directory.path(), &options, &source).unwrap();
    fs::write(directory.path().join("workspace.jsonc"), "{}").unwrap();
    assert!(plan.apply_files().is_err());
    assert_eq!(fs::read(directory.path().join(".bitmap")).unwrap(), before);
    assert!(
        !directory
            .path()
            .join("components")
            .exists(),
    );
}
#[test]
fn output_replacement_rejects_bitmap_publication_after_materialization() {
    let (directory, options, source) = fixture();
    let before = fs::read(directory.path().join(".bitmap")).unwrap();
    let mut plan = Plan::prepare(directory.path(), &options, &source).unwrap();
    plan.apply_files().unwrap();
    fs::write(directory.path().join("components/target/source.js"), "raced").unwrap();
    assert!(plan.commit_bitmap("test").is_err());
    assert_eq!(fs::read(directory.path().join(".bitmap")).unwrap(), before);
}
#[test]
fn invalid_late_environment_config_retains_copied_files_and_original_bitmap() {
    let (directory, options, source) = fixture();
    let before = fs::read(directory.path().join(".bitmap")).unwrap();
    let mut plan = Plan::prepare(directory.path(), &options, &source).unwrap();
    plan.apply_files().unwrap();
    assert!(plan.set_config(Value::Null).is_err());
    assert!(
        directory
            .path()
            .join("components/target/source.js")
            .is_file(),
    );
    assert_eq!(fs::read(directory.path().join(".bitmap")).unwrap(), before);
}
#[cfg(unix)]
#[test]
fn replaced_target_parent_symlink_cannot_escape_the_workspace() {
    let (directory, options, source) = fixture();
    let outside = tempfile::tempdir().unwrap();
    fs::create_dir(directory.path().join("components")).unwrap();
    let mut plan = Plan::prepare(directory.path(), &options, &source).unwrap();
    fs::remove_dir(directory.path().join("components")).unwrap();
    std::os::unix::fs::symlink(outside.path(), directory.path().join("components")).unwrap();
    assert!(plan.apply_files().is_err());
    assert!(!outside.path().join("target").exists());
}

#[test]
fn scope_copy_defers_all_remote_name_and_identity_replacements() {
    let (directory, mut options, mut source) = fixture();
    options.remote = true;
    source["refactorIdentity"] = json!(false);
    let mut plan = Plan::prepare(directory.path(), &options, &source).unwrap();
    assert_eq!(plan.bitmap()["target"]["mainFile"], "source.js");
    plan.apply_files().unwrap();
    assert_eq!(
        fs::read(directory.path().join("components/target/source.js")).unwrap(),
        fs::read(directory.path().join("original/source.js")).unwrap(),
    );
}
#[test]
fn no_link_and_explicit_config_override_preserve_unrelated_source_config() {
    let (directory, mut options, mut source) = fixture();
    options.no_link = true;
    source["config"] = json!({"custom/aspect":{"overridden":true}});
    let plan = Plan::prepare(directory.path(), &options, &source).unwrap();
    assert!(
        plan.configuration()
            .get("teambit.component/forking")
            .is_none(),
    );
    assert_eq!(plan.configuration()["custom/aspect"], json!({"overridden":true}));
}
#[test]
fn dependency_refactor_keeps_package_lookalikes_and_validates_before_writes() {
    let (directory, _, _) = fixture();
    let root = directory.path();
    fs::write(root.join("original/source.js"), "require('@old/pkg'); require('@old/pkg-extra');")
        .unwrap();
    let rows = vec![json!({"rootDir":"original","files":["source.js"]})];
    let pairs = vec![("@old/pkg".into(), "@new/pkg".into())];
    let plan = super::Refactor::prepare(root, &rows, &pairs, true, false).unwrap();
    plan.apply().unwrap();
    assert_eq!(
        fs::read(root.join("original/source.js")).unwrap(),
        b"require('@new/pkg'); require('@old/pkg-extra');",
    );
    assert!(plan.apply().is_err());
}

#[test]
fn copied_configs_follow_javascript_truthiness_for_both_receipt_shapes() {
    let (directory, options, mut source) = fixture();
    let values = json!({"null":null,"false":false,"zero":0,"negativeZero":-0.0,"emptyString":"","array":[],"object":{},"true":true});
    let entries = values
        .as_object()
        .unwrap()
        .iter()
        .map(|(id, config)| json!({"id":id,"config":config}))
        .collect::<Vec<_>>();
    for configs in [values, json!(entries)] {
        source["sourceConfigs"] = configs;
        let plan = Plan::prepare(directory.path(), &options, &source).unwrap();
        for id in ["null", "false", "zero", "negativeZero", "emptyString"] {
            assert!(plan.configuration().get(id).is_none(), "{id}");
        }
        assert_eq!(plan.configuration()["array"], json!([]));
        assert_eq!(plan.configuration()["object"], json!({}));
        assert_eq!(plan.configuration()["true"], true);
    }
}

#[test]
fn same_name_fork_qualifies_original_and_target_bitmap_keys() {
    let (directory, mut options, source) = fixture();
    options.target = Some("source".into());
    let mut plan = Plan::prepare(directory.path(), &options, &source).unwrap();
    assert!(plan.bitmap().get("source").is_none());
    assert_eq!(plan.bitmap()["old.scope/source"]["version"], "0.0.1");
    assert_eq!(plan.bitmap()["new.scope/source"]["name"], "source");
    plan.set_config(json!({"custom/aspect":{}}))
        .unwrap();
    assert_eq!(plan.configuration(), &json!({"custom/aspect":{}}));
}
#[test]
fn occupied_directory_error_precedes_duplicate_component_identity() {
    let (directory, options, source) = fixture();
    let bitmap = directory.path().join(".bitmap");
    let mut rows: Value = serde_json::from_slice(&fs::read(&bitmap).unwrap()).unwrap();
    rows["target"] = json!({"name":"target","scope":"","defaultScope":"new.scope","rootDir":"components/target","mainFile":"index.js"});
    fs::write(bitmap, serde_json::to_vec(&rows).unwrap()).unwrap();
    fs::create_dir_all(directory.path().join("components/target")).unwrap();
    fs::write(directory.path().join("components/target/keep"), "occupied").unwrap();
    let error = Plan::prepare(directory.path(), &options, &source).err().unwrap();
    assert_eq!(
        error.to_string(),
        r#"unable to create component at "components/target", this directory is not empty"#,
    );
}
