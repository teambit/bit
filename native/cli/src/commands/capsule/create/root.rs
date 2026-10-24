//! Capsule root path selection and base-directory validation.

use super::{
    super::{ScopeRoot, compute_capsules_root_dirs, object_hash_short, resolve_capsules_dir},
    CreateArgs,
};
use std::{
    io,
    path::{Component, Path, PathBuf},
};

pub(super) fn resolve_create_root(
    cwd: &Path,
    root: &ScopeRoot,
    create_args: &CreateArgs,
) -> io::Result<PathBuf> {
    let default_root = PathBuf::from(resolve_capsules_dir(cwd)?);
    let root_base = match &create_args.root_base_dir {
        Some(value) => validate_root_base_dir(value, cwd)?,
        None => default_root.clone(),
    };
    if let Some(base_dir) = &create_args.base_dir {
        let relative = validate_base_dir(base_dir)?;
        return Ok(normalize_lexical(&root_base.join(if create_args.use_hash {
            PathBuf::from(object_hash_short(base_dir))
        } else {
            relative
        })));
    }
    if create_args.use_hash {
        return Ok(root_base.join(object_hash_short(&root.path.to_string_lossy())));
    }
    let dirs = compute_capsules_root_dirs(cwd, root)?;
    let ws_dir = PathBuf::from(dirs.workspace.ok_or_else(|| {
        io::Error::other("missing workspace capsules root dir")
    })?);
    if create_args.root_base_dir.is_none() {
        return Ok(ws_dir);
    }
    let sub = ws_dir
        .strip_prefix(&default_root)
        .map_err(|_| io::Error::other("custom capsule root cannot map workspace path"))?;
    Ok(root_base.join(sub))
}

fn validate_base_dir(value: &str) -> io::Result<PathBuf> {
    let path = Path::new(value);
    let unix_absolute = cfg!(unix) && path.is_absolute();
    if path.as_os_str().is_empty()
        || path
            .components()
            .any(|part| {
                !(matches!(part, Component::Normal(_) | Component::CurDir | Component::ParentDir)
                    || unix_absolute && matches!(part, Component::RootDir))
            })
    {
        return Err(io::Error::other("unsupported capsule base dir"));
    }
    let relative = path
        .components()
        .filter_map(|part| match part {
            Component::Normal(_) | Component::ParentDir => Some(part.as_os_str()),
            _ => None,
        })
        .collect::<PathBuf>();
    Ok(relative)
}

fn validate_root_base_dir(value: &str, cwd: &Path) -> io::Result<PathBuf> {
    let path = Path::new(value);
    if path.as_os_str().is_empty()
        || path
            .components()
            .any(|part| {
                !matches!(
                    part,
                    Component::Prefix(_)
                        | Component::RootDir
                        | Component::CurDir
                        | Component::ParentDir
                        | Component::Normal(_),
                )
            })
    {
        return Err(io::Error::other("unsupported capsule root base dir"));
    }
    let joined = if path.is_absolute() { path.to_path_buf() } else { cwd.join(path) };
    Ok(normalize_lexical(&joined))
}

fn normalize_lexical(path: &Path) -> PathBuf {
    let mut normalized = PathBuf::new();
    for component in path.components() {
        match component {
            Component::CurDir => {}
            Component::ParentDir => {
                normalized.pop();
            }
            other => normalized.push(other.as_os_str()),
        }
    }
    normalized
}
