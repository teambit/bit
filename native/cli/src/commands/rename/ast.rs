//! Published TypeScript transformers use private spools; Rust retains every workspace path.
use crate::commands::add::ProjectedLinker;
use bit_object_import::component_rename::Plan;
use serde_json::json;
use std::{
    fs, io,
    path::Path,
    sync::atomic::{AtomicU64, Ordering},
};
static NEXT: AtomicU64 = AtomicU64::new(0);
struct Spool(std::path::PathBuf);
impl Drop for Spool {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

pub(super) fn transform(
    root: &Path,
    plan: &mut Plan,
    linker: &mut ProjectedLinker,
) -> io::Result<()> {
    let path = std::env::temp_dir()
        .join(format!(
            "bit-rename-ast-{}-{}",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::Relaxed),
        ));
    fs::create_dir(&path)?;
    let spool = Spool(path);
    let inputs = plan.ast_inputs();
    let mut rows = Vec::new();
    for (index, (path, bytes)) in inputs.iter().enumerate() {
        let stored = spool.0.join(index.to_string());
        fs::write(&stored, bytes)?;
        rows.push(json!({"spool":stored,"filename":path}));
    }
    linker.call(root,"renameAst",&json!({"files":rows,"sourceName":plan.identity.source_name.rsplit('/').next(),"targetName":plan.identity.target_name.rsplit('/').next()}))?;
    print!("{}", linker.take_stdout());
    for (index, (path, _)) in inputs.iter().enumerate() {
        let source = spool.0.join(index.to_string());
        let metadata = fs::symlink_metadata(&source)?;
        if !metadata.is_file() || metadata.len() > 32 * 1024 * 1024 {
            return Err(io::Error::other("rename AST spool is not a bounded regular file"));
        }
        plan.transformed(path, fs::read(source)?)?;
    }
    Ok(())
}
