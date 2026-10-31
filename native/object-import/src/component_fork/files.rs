use super::{
    Options,
    identity::{Identity, leaf, source_id},
    required, unsupported,
};
use crate::{component_rename::copy_refactor, component_tracking::observe::Observed};
use serde_json::Value;
use std::{
    collections::BTreeSet,
    fs, io,
    path::{Component, Path, PathBuf},
};

pub(super) struct Copy {
    pub source: PathBuf,
    pub destination: PathBuf,
    pub bytes: Vec<u8>,
}
pub(super) fn prepare(
    root: &Path,
    options: &Options,
    source: &Value,
    id: &Identity,
    observed: &mut Observed,
) -> io::Result<Vec<Copy>> {
    let files = source["files"].as_array().ok_or_else(|| unsupported("fork source inventory"))?;
    if files.len() > 16384 {
        return Err(unsupported("fork file count budget"));
    }
    let mut output = Vec::new();
    let mut destinations = BTreeSet::new();
    for file in files {
        let relative = file
            .as_str()
            .or_else(|| file["relativePath"].as_str())
            .or_else(|| file["path"].as_str())
            .ok_or_else(|| unsupported("fork source relative path"))?;
        relative_path(relative)?;
        let path = source_path(root, source, relative, observed)?;
        let bytes = required(observed, &path)?;
        let (name, bytes) = transform(options, source, id, relative, bytes)?;
        let destination = root.join(&id.directory).join(name);
        if !destinations.insert(destination.clone()) {
            return Err(unsupported("fork duplicate destination source"));
        }
        output.push(Copy { source: path, destination, bytes });
    }
    if !destinations.contains(&root.join(&id.directory).join(&id.main)) {
        return Err(unsupported("fork main file absent from inventory"));
    }
    budget(&output)?;
    Ok(output)
}
fn transform(
    options: &Options,
    source: &Value,
    id: &Identity,
    relative: &str,
    bytes: Vec<u8>,
) -> io::Result<(String, Vec<u8>)> {
    if !options.remote || source["refactorIdentity"] == false {
        return Ok((relative.into(), bytes));
    }
    let (scope, name) = source_id(options, source)?;
    let original = format!("{scope}/{name}");
    // replaceMultipleStrings uses ordered global regex replacement, before variable/class changes.
    let mut bytes =
        if options.ast { bytes } else { copy_refactor::replace(&bytes, &original, &id.target)? };
    if options.preserve {
        return Ok((relative.into(), bytes));
    }
    if !options.ast && source["refactorVariables"] != false {
        bytes = copy_refactor::content(&bytes, leaf(name), leaf(&id.name))?;
    }
    let filename = copy_refactor::filename(relative, leaf(name), leaf(&id.name))?;
    Ok((filename, bytes))
}
pub(super) fn source_path(
    root: &Path,
    source: &Value,
    relative: &str,
    observed: &mut Observed,
) -> io::Result<PathBuf> {
    if let Some(overlay) = source["sourceOverlays"][relative].as_str() {
        let private = Path::new(
            source["sourceOverlayRoot"]
                .as_str()
                .ok_or_else(|| unsupported("fork callback source root"))?,
        );
        let path = Path::new(overlay);
        private_root(private, path, "bit-native-callback-")?;
        observed.ancestors(
            private,
            path.parent().ok_or_else(|| unsupported("fork source parent"))?,
        )?;
        return Ok(path.into());
    }
    let directory = source["sourceDirectory"]
        .as_str()
        .map_or_else(
            || {
                root.join(
                    source["rootDir"]
                        .as_str()
                        .or_else(|| source["directory"].as_str())
                        .unwrap_or_default(),
                )
            },
            PathBuf::from,
        );
    if !directory.starts_with(root) {
        private_root(&directory, &directory.join(relative), "bit-native-fork-")?;
    }
    let path = directory.join(relative);
    observed.ancestors(
        if directory.starts_with(root) { root } else { &directory },
        path.parent().ok_or_else(|| unsupported("fork source parent"))?,
    )?;
    Ok(path)
}
fn private_root(root: &Path, path: &Path, prefix: &str) -> io::Result<()> {
    if !path.starts_with(root)
        || root
            .file_name()
            .and_then(|name| name.to_str())
            .is_none_or(|name| !name.starts_with(prefix))
        || root
            .parent()
            .ok_or_else(|| unsupported("fork private source parent"))?
            .canonicalize()?
            != std::env::temp_dir().canonicalize()?
    {
        return Err(unsupported("fork source outside owned private directory"));
    }
    Ok(())
}
pub(super) fn relative_path(path: &str) -> io::Result<()> {
    if path.is_empty()
        || Path::new(path)
            .components()
            .any(|part| !matches!(part, Component::Normal(_)))
    {
        return Err(unsupported("fork unsafe source path"));
    }
    Ok(())
}
pub(super) fn apply(files: &[Copy]) -> io::Result<()> {
    for file in files {
        if let Some(parent) = file.destination.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::write(&file.destination, &file.bytes)?;
    }
    Ok(())
}

pub(super) fn budget(files: &[Copy]) -> io::Result<()> {
    let total = files
        .iter()
        .try_fold(0usize, |total, file| total.checked_add(file.bytes.len()))
        .ok_or_else(|| unsupported("fork source bytes overflow"))?;
    if total > 128 * 1024 * 1024 {
        return Err(unsupported("fork source aggregate byte limit"));
    }
    Ok(())
}

pub(super) fn retain_output(
    root: &Path,
    files: &[Copy],
    observed: &mut Observed,
) -> io::Result<()> {
    for file in files {
        observed.ancestors(
            root,
            file.destination.parent().ok_or_else(|| unsupported("fork output parent"))?,
        )?;
        let bytes = required(observed, &file.destination)?;
        if bytes != file.bytes {
            return Err(unsupported("fork output changed during materialization"));
        }
    }
    Ok(())
}
