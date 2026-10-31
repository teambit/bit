//! Mover's default `RemovePath` recursively removes the old root before writing new files.
use super::{Observed, Plan, unsupported};
use std::{
    collections::BTreeMap,
    fs, io,
    path::{Path, PathBuf},
};

pub(super) struct Tree {
    directories: BTreeMap<PathBuf, Vec<String>>,
    observed: crate::component_tracking::observe::Observed,
}
pub(super) fn prepare(plan: &mut Plan) -> io::Result<()> {
    if plan.identity.exported
        || plan.identity.source_directory.trim().is_empty()
        || plan.identity.source_directory.trim()
            == plan.identity.target_directory.trim()
    {
        return Ok(());
    }
    let mut tree = Tree { directories: BTreeMap::new(), observed: Observed::default() };
    let root = plan.root.join(&plan.identity.source_directory);
    let mut pending = vec![root];
    while let Some(directory) = pending.pop() {
        if tree.directories.len() >= 65536 {
            return Err(unsupported("rename cleanup directory limit"));
        }
        tree.observed.ancestors(&plan.root, &directory)?;
        let names = entries(&directory)?;
        for name in &names {
            observe(&mut tree, &directory.join(name), &mut pending)?;
        }
        tree.directories.insert(directory, names);
    }
    plan.cleanup = Some(tree);
    Ok(())
}
fn observe(tree: &mut Tree, path: &Path, pending: &mut Vec<PathBuf>) -> io::Result<()> {
    let metadata = fs::symlink_metadata(path)?;
    if metadata.file_type().is_symlink() || reparse(&metadata) {
        return Err(unsupported("rename cleanup requires regular paths"));
    }
    if metadata.is_dir() {
        pending.push(path.to_owned());
    } else {
        tree.observed.read(path)?;
    }
    Ok(())
}
fn entries(path: &Path) -> io::Result<Vec<String>> {
    let mut names = fs::read_dir(path)?
        .map(|entry| {
            entry.and_then(|entry| {
                entry
                    .file_name()
                    .into_string()
                    .map_err(|_| unsupported("rename cleanup UTF-8 paths"))
            })
        })
        .collect::<io::Result<Vec<_>>>()?;
    if names.len() > 65536 {
        return Err(unsupported("rename cleanup entry limit"));
    }
    names.sort();
    Ok(names)
}
pub(super) fn validate(plan: &Plan) -> io::Result<()> {
    let Some(tree) = &plan.cleanup else { return Ok(()) };
    tree.observed.validate()?;
    for (directory, names) in &tree.directories {
        if entries(directory)? != *names {
            return Err(unsupported("rename cleanup tree changed before publication"));
        }
    }
    Ok(())
}
pub(super) fn apply(plan: &Plan) -> io::Result<()> {
    if plan.cleanup.is_none() {
        return Ok(());
    }
    validate(plan)?;
    fs::remove_dir_all(plan.root.join(&plan.identity.source_directory))
}
fn reparse(metadata: &fs::Metadata) -> bool {
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        metadata.file_attributes() & 0x0400 != 0
    }
    #[cfg(not(windows))]
    {
        let _ = metadata;
        false
    }
}
