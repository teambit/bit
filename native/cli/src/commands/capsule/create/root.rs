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
        Some(value) => validate_root_base_dir(value)?,
        None => default_root.clone(),
    };
    if let Some(base_dir) = &create_args.base_dir {
        let relative = validate_base_dir(base_dir)?;
        return Ok(root_base.join(if create_args.use_hash {
            PathBuf::from(object_hash_short(base_dir))
        } else {
            relative
        }));
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
                !(matches!(part, Component::Normal(_))
                    || unix_absolute && matches!(part, Component::RootDir))
            })
    {
        return Err(io::Error::other("unsupported capsule base dir"));
    }
    let relative = path
        .components()
        .filter_map(|part| match part {
            Component::Normal(segment) => Some(segment),
            _ => None,
        })
        .collect::<PathBuf>();
    if relative.as_os_str().is_empty() {
        return Err(io::Error::other("unsupported capsule base dir"));
    }
    Ok(relative)
}

fn validate_root_base_dir(value: &str) -> io::Result<PathBuf> {
    let path = Path::new(value);
    if !path.is_absolute()
        || path
            .components()
            .any(|part| {
                !matches!(part, Component::Prefix(_) | Component::RootDir | Component::Normal(_))
            })
    {
        return Err(io::Error::other("unsupported capsule root base dir"));
    }
    Ok(path.to_path_buf())
}
