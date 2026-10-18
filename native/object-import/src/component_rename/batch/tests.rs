use super::Batch;
use crate::component_rename::{Options, Plan};
use serde_json::{Value, json};
use std::{
    fs, io,
    path::{Path, PathBuf},
    sync::atomic::{AtomicU64, Ordering},
};

static COUNTER: AtomicU64 = AtomicU64::new(0);
struct Directory(PathBuf);
impl Directory {
    fn new() -> Self {
        let path = std::env::temp_dir()
            .join(format!(
                "bit-rename-batch-{}-{}",
                std::process::id(),
                COUNTER.fetch_add(1, Ordering::Relaxed),
            ));
        fs::create_dir(&path).unwrap();
        Self(path)
    }
    fn path(&self) -> &Path {
        &self.0
    }
}
impl Drop for Directory {
    fn drop(&mut self) {
        let _cleanup = fs::remove_dir_all(&self.0);
    }
}

fn workspace() -> (Directory, Vec<Options>, Vec<Value>) {
    let directory = Directory::new();
    let root = directory.path();
    fs::write(root.join("workspace.jsonc"), "{}").unwrap();
    let mut bitmap = json!({});
    let mut options = Vec::new();
    let mut facts = Vec::new();
    for name in ["first", "second"] {
        fs::create_dir(root.join(name)).unwrap();
        fs::write(root.join(name).join("index.js"), format!("module.exports='{name}';")).unwrap();
        bitmap[name] = json!({"name":name,"scope":"","version":"","defaultScope":"my.scope","rootDir":name,"mainFile":"index.js"});
        options.push(Options {
            source: name.into(),
            target: format!("new-{name}"),
            ..Options::default()
        });
        facts.push(
            json!({"components":[{"identity":format!("my.scope/{name}"),"files":["index.js"]}]}),
        );
    }
    fs::write(root.join(".bitmap"), serde_json::to_vec(&bitmap).unwrap()).unwrap();
    (directory, options, facts)
}

#[test]
fn parallel_plans_preserve_serial_proposals_and_source_proofs() {
    let (directory, options, facts) = workspace();
    let parallel = Batch::prepare_plans(directory.path(), &options, &facts).unwrap();
    for ((options, facts), parallel) in options
        .iter()
        .zip(&facts)
        .zip(&parallel)
    {
        let serial = Plan::prepare(directory.path(), options, facts).unwrap();
        assert_eq!(parallel.receipt(), serial.receipt());
        assert_eq!(parallel.bitmap(), serial.bitmap());
        assert_eq!(parallel.ast_inputs(), serial.ast_inputs());
        parallel.validate().unwrap();
    }
    fs::write(directory.path().join("second/index.js"), "changed").unwrap();
    parallel[0].validate().unwrap();
    assert!(parallel[1].validate().is_err());
}

#[test]
fn parallel_failures_report_the_first_requested_plan_without_publication() {
    let (directory, mut options, facts) = workspace();
    let before = fs::read(directory.path().join(".bitmap")).unwrap();
    options[0].target = "InvalidFirst".into();
    options[1].source = "missing-second".into();
    let expected = Plan::prepare(directory.path(), &options[0], &facts[0]).err().unwrap();
    let actual = Batch::prepare_plans(directory.path(), &options, &facts).err().unwrap();
    assert_eq!(actual.kind(), expected.kind());
    assert_eq!(actual.to_string(), expected.to_string());
    assert_eq!(fs::read(directory.path().join(".bitmap")).unwrap(), before);
    assert!(
        !directory
            .path()
            .join("components")
            .exists(),
    );
}

#[test]
fn mismatched_inputs_fail_before_reading_the_workspace() {
    let directory = Directory::new();
    let result = Batch::prepare_plans(directory.path(), &[Options::default()], &[]);
    assert_eq!(result.err().unwrap().kind(), io::ErrorKind::InvalidInput);
    assert!(Batch::prepare_plans(directory.path(), &[], &[]).unwrap().is_empty());
}

#[test]
fn missing_dependent_file_precedes_lazy_invalid_package_regex() {
    let (directory, options, facts) = workspace();
    let plans = Batch::prepare_plans(directory.path(), &options, &facts).unwrap();
    let mut batch = Batch::prepare(directory.path(), plans).unwrap();
    let rows =
        vec![json!({"identity":"my.scope/dependent","directory":"first","files":["missing.js"]})];
    let error = batch
        .refactor_loaded(&rows, &[("[".into(), "invalid".into())])
        .unwrap_err();
    assert_eq!(error.kind(), io::ErrorKind::NotFound);
    assert!(
        !directory
            .path()
            .join("components")
            .exists(),
    );
}

#[test]
fn generic_plan_package_matcher_preserves_binary_then_missing_file_error_order() {
    let (directory, mut options, mut facts) = workspace();
    options[0].refactor = true;
    facts[0]["sourcePackage"] = json!("[");
    facts[0]["targetPackage"] = json!("new-package");
    facts[0]["components"]
        .as_array_mut()
        .unwrap()
        .push(json!({"identity":"my.scope/second","rootDir":"second","files":["missing.js"]}));
    let path = directory.path().join("first/index.js");
    fs::write(&path, b"binary\0source").unwrap();
    let error = Plan::prepare(directory.path(), &options[0], &facts[0]).err().unwrap();
    assert_eq!(error.kind(), io::ErrorKind::NotFound);
    fs::write(&path, b"text source").unwrap();
    let error = Plan::prepare(directory.path(), &options[0], &facts[0]).err().unwrap();
    let expected =
        crate::component_rename::refactor::package(b"text", "[", "new-package").unwrap_err();
    assert_eq!(error.kind(), expected.kind());
    assert_eq!(error.to_string(), expected.to_string());
    assert!(
        !directory
            .path()
            .join("components")
            .exists(),
    );
}
