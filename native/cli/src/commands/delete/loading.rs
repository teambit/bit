//! Delete requires valid classes; remove deliberately tolerates invalid component loads.
use crate::commands::{color::Chalk, remove::preparation as selection};
use serde_json::Value;
use std::{io, path::Path};

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
            .filter(|file| !file.is_empty())
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

fn missing_directory(directory: &str, chalk: Chalk) -> io::Error {
    io::Error::other(format!(
        "error: component in path \"{}\" was not found, the following options are available depending on the situation:\n1. if the component directory was deleted by mistake, you can restore it by running \"bit checkout reset <component-id>\".\n2. if the component-dir was renamed, you can use \"bit move <old-dir> <new-dir>\" to move it to the new location.\n3. if the component directory was deleted deliberately, you can remove the component from the workspace by running \"bit remove <component-id>\".",
        chalk.bold(directory),
    ))
}

fn missing_main(fallback_id: &str, row: &Value, main: &str, chalk: Chalk) -> io::Error {
    let (fallback_scope, fallback_name) = fallback_id
        .split_once('/')
        .map_or(("", fallback_id), |(scope, name)| (scope, name));
    let name = row["name"]
        .as_str()
        .filter(|name| !name.is_empty())
        .unwrap_or(fallback_name);
    let version = row["version"].as_str().unwrap_or_default();
    let scope = row_scope_or_default(row, fallback_scope);
    let id = format!(
        "{}{}{name}{}",
        scope,
        if scope.is_empty() { "" } else { "/" },
        if version.is_empty() { String::new() } else { format!("@{version}") },
    );
    io::Error::other(format!(
        "error: main file {} was removed from {}.\nplease use \"bit remove\" to delete the component or \"bit add\" with \"--main\" and \"--id\" flags to add a new mainFile",
        chalk.bold(main),
        chalk.bold(&id),
    ))
}

fn row_scope_or_default<'a>(row: &'a Value, fallback_scope: &'a str) -> &'a str {
    row["scope"]
        .as_str()
        .filter(|scope| !scope.is_empty())
        .or_else(|| {
            row["defaultScope"]
                .as_str()
                .filter(|scope| !scope.is_empty())
        })
        .unwrap_or(fallback_scope)
}
