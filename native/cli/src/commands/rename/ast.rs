//! Published `TypeScript` transformers use private spools; Rust retains every workspace path.
//!
//! [`transform`] invokes AST import rewrites through [`ProjectedLinker`] for a component rename [`Plan`].
use crate::commands::add::ProjectedLinker;
use bit_object_import::component_rename::Plan;
use serde_json::json;
use std::{
    fs, io,
    path::Path,
    sync::atomic::{AtomicU64, Ordering},
};
/// Monotonic counter used to allocate unique temporary AST spool directory names.
static NEXT: AtomicU64 = AtomicU64::new(0);
/// RAII guard that removes a temporary AST transformation spool directory on drop.
struct Spool(std::path::PathBuf);
impl Drop for Spool {
    #[inline]
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

/// Applies `TypeScript` AST import rewrites in a temporary spool directory via [`ProjectedLinker`].
pub(super) fn transform(
    root: &Path,
    plan: &mut Plan,
    linker: &mut ProjectedLinker,
) -> io::Result<()> {
    let inputs = plan.ast_inputs();
    if inputs.is_empty() {
        return Ok(());
    }
    let (Some(source_name), Some(target_name)) = (
        short_component_name(&plan.identity.source_name),
        short_component_name(&plan.identity.target_name),
    ) else {
        return Err(io::Error::other("rename AST component name is empty"));
    };
    let path = std::env::temp_dir()
        .join(format!(
            "bit-rename-ast-{}-{}",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::Relaxed),
        ));
    fs::create_dir_all(&path)?;
    let spool = Spool(path);
    let mut rows = Vec::with_capacity(inputs.len());
    for (index, (path, bytes)) in inputs.iter().enumerate() {
        let stored = spool.0.join(index.to_string());
        fs::write(&stored, bytes)?;
        rows.push(json!({"spool":stored,"filename":path}));
    }
    let result = linker.call(
        root,
        "renameAst",
        &json!({
            "files": rows,
            "sourceName": source_name,
            "targetName": target_name,
        }),
    );
    let stdout = linker.take_stdout();
    if !stdout.is_empty() {
        print!("{stdout}");
    }
    result?;
    read_transformed_inputs(&spool.0, &inputs, plan)
}

/// Reads transformed source files back from `spool_dir` and records them into `plan`.
#[inline]
fn read_transformed_inputs(
    spool_dir: &Path,
    inputs: &[(std::path::PathBuf, Vec<u8>)],
    plan: &mut Plan,
) -> io::Result<()> {
    for (index, (path, _)) in inputs.iter().enumerate() {
        let source = spool_dir.join(index.to_string());
        let metadata = fs::symlink_metadata(&source)?;
        if !metadata.is_file() || metadata.len() > 32 * 1024 * 1024 {
            return Err(io::Error::other("rename AST spool is not a bounded regular file"));
        }
        plan.transformed(path, fs::read(source)?)?;
    }
    Ok(())
}

/// Extracts the trailing non-empty slash segment of a component `name` after stripping `@version`.
#[inline]
fn short_component_name(name: &str) -> Option<&str> {
    let trimmed = name.trim();
    let bare = trimmed
        .rsplit_once('@')
        .filter(|(prefix, _)| !prefix.trim().is_empty())
        .map_or(trimmed, |(prefix, _)| prefix.trim());
    bare.trim_end_matches('/')
        .rsplit('/')
        .next()
        .map(str::trim)
        .filter(|segment| !segment.is_empty())
}
