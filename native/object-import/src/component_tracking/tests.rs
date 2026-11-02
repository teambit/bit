//! Unit tests for `bit add` component tracking [`Plan`] and [`Options`] preparation ([`main_file`], [`planning`], [`root`], [`fixture`]) and
//! `.bitmap` updates in `bit-object-import` tracking workflows.

mod main_file;
mod planning;
mod root;
use super::{Options, Plan};
use serde_json::{Value, json};
use std::{
    fs,
    path::PathBuf,
    sync::atomic::{AtomicU64, Ordering},
};
/// Monotonic counter for unique component tracking test directory names.
static NEXT: AtomicU64 = AtomicU64::new(0);
/// Creates an isolated temporary workspace directory with `.bit`, `workspace.jsonc`, and `.bitmap`.
pub(super) fn fixture() -> PathBuf {
    let root = std::env::temp_dir()
        .join(format!(
            "bit-tracking-{}-{}",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::Relaxed),
        ));
    fs::create_dir_all(root.join(".bit")).unwrap();
    fs::write(root.join("workspace.jsonc"), "{}").unwrap();
    fs::write(
        root.join(".bitmap"),
        crate::render_workspace_bitmap(&json!({"$schema-version":"17.0.0"})).unwrap(),
    )
    .unwrap();
    root
}
/// Builds a baseline workspace facts JSON object with `defaultScope: "scope"`.
fn facts() -> Value {
    json!({"defaultScope":"scope","workspace":{"teambit.workspace/workspace":{"defaultScope":"scope"}}})
}
fn source(root: &std::path::Path, path: &str) {
    fs::create_dir_all(root.join(path).parent().unwrap()).unwrap();
    fs::write(root.join(path), "module.exports=1;\n").unwrap();
}
fn options(paths: &[&str]) -> Options {
    Options {
        paths: paths
            .iter()
            .map(|path| (*path).into())
            .collect(),
        ..Options::default()
    }
}
