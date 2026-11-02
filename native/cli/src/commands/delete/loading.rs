//! Delete ([`validate`]) requires valid classes; remove deliberately tolerates invalid component loads.
//!
//! Invalidates stale dependency caches and checks component root directories and main files.
use crate::commands::{color::Chalk, remove::preparation as selection};
use serde_json::Value;
use std::{io, path::Path};

/// Validates that each target in `ids` has an existing root directory and main file before soft deletion.
pub(in crate::commands) fn validate(
    root: &Path,
    bitmap: &Value,
    ids: &[String],
    chalk: Chalk,
) -> io::Result<()> {
    // ComponentLoader.shouldRunInParallel invalidates stale dependencies before
    // loadOne can reject a removed directory or main file.
    let cache = bit_install::dependencies::cache::invalidation::deps_dir(root);
    bit_install::dependencies::cache::invalidation::invalidate(root, &cache)?;
    for id in ids {
        let row = selection::row(bitmap, id)?;
        let directory = row["rootDir"]
            .as_str()
            .map(str::trim)
            .filter(|dir| !dir.is_empty())
            .ok_or_else(|| io::Error::other("component root"))?;
        if !bit_object_import::component_remove::has_scanned_files(root, directory, bitmap)? {
            return Err(missing_directory(directory, chalk));
        }
        let main = row["mainFile"]
            .as_str()
            .map(str::trim)
            .filter(|file| is_safe_rel_path(file))
            .ok_or_else(|| io::Error::other("component main file"))?;
        if !root
            .join(directory)
            .join(main)
            .is_file()
        {
            return Err(missing_main(id, row, main, chalk));
        }
    }
    Ok(())
}

/// Returns `true` when `file` is a non-empty relative path without `..` parent traversal segments.
#[inline]
fn is_safe_rel_path(file: &str) -> bool {
    let path = Path::new(file);
    !file.is_empty()
        && !path.is_absolute()
        && !path
            .components()
            .any(|part| matches!(part, std::path::Component::ParentDir))
}

#[inline]
fn missing_directory(directory: &str, chalk: Chalk) -> io::Error {
    io::Error::other(format!(
        "error: component in path \"{}\" was not found, the following options are available depending on the situation:\n1. if the component directory was deleted by mistake, you can restore it by running \"bit checkout reset <component-id>\".\n2. if the component-dir was renamed, you can use \"bit move <old-dir> <new-dir>\" to move it to the new location.\n3. if the component directory was deleted deliberately, you can remove the component from the workspace by running \"bit remove <component-id>\".",
        chalk.bold(directory),
    ))
}

fn missing_main(fallback_id: &str, row: &Value, main: &str, chalk: Chalk) -> io::Error {
    let fallback_id = fallback_id.trim();
    let fallback_bare = fallback_id
        .rsplit_once('@')
        .filter(|(base, _)| !base.trim().is_empty())
        .map_or(fallback_id, |(base, _)| base.trim());
    let (fallback_scope, fallback_name) = fallback_bare
        .split_once('/')
        .map_or(("", fallback_bare), |(scope, name)| (scope.trim(), name.trim()));
    let name = row["name"]
        .as_str()
        .map(str::trim)
        .filter(|name| !name.is_empty())
        .unwrap_or(fallback_name);
    let version = row["version"].as_str().map_or("", str::trim);
    let scope = row_scope_or_default(row, fallback_scope);
    let id = format!(
        "{scope}{}{name}{}{version}",
        if scope.is_empty() { "" } else { "/" },
        if version.is_empty() { "" } else { "@" },
    );
    io::Error::other(format!(
        "error: main file {} was removed from {}.\nplease use \"bit remove\" to delete the component or \"bit add\" with \"--main\" and \"--id\" flags to add a new mainFile",
        chalk.bold(main),
        chalk.bold(&id),
    ))
}

#[inline]
fn row_scope_or_default<'a>(row: &'a Value, fallback_scope: &'a str) -> &'a str {
    row["scope"]
        .as_str()
        .map(str::trim)
        .filter(|scope| !scope.is_empty())
        .or_else(|| {
            row["defaultScope"]
                .as_str()
                .map(str::trim)
                .filter(|scope| !scope.is_empty())
        })
        .unwrap_or(fallback_scope)
}
