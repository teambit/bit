//! `ImporterMain.fetch` ([`ids`], [`Prepare`]) resolves tracked aliases and implicit remote lane references.

#[cfg(test)]
mod tests;
use super::super::{Prepare, config, invalid};
use std::{fs, io, path::Path};

/// Resolves explicit or [`tracked`] remote lane identifiers and aliases via [`resolve_alias`] for [`Prepare`].
pub(super) fn ids(input: &Prepare) -> io::Result<Vec<String>> {
    if input.ids.is_empty() {
        return tracked(&input.root);
    }
    let mut scope_doc = None;
    input.ids
        .iter()
        .map(String::as_str)
        .map(str::trim)
        .map(|id| id.rsplit_once('@').map_or(id, |(base, _)| base.trim()))
        .filter(|id| !id.is_empty() && *id != "main")
        .map(|id| {
            if let Some((scope, lane)) = id.split_once('/') {
                let (scope, lane) = (scope.trim(), lane.trim());
                if scope.is_empty() || lane.is_empty() {
                    return Err(invalid("inbound lane ID"));
                }
                return Ok(format!("{scope}/{lane}"));
            }
            resolve_alias(&input.root, &mut scope_doc, id)
        })
        .collect()
}

/// Resolves a local lane alias `id` to `<remoteScope>/<remoteLane>` using `scope.json` tracking entries.
fn resolve_alias(
    root: &Path,
    scope_doc: &mut Option<serde_json::Value>,
    id: &str,
) -> io::Result<String> {
    let scope = match scope_doc {
        Some(doc) => doc,
        None => scope_doc.insert(config::document(&crate::scope_path(root).join("scope.json"))?),
    };
    let row = scope["lanes"]["tracking"]
        .as_array()
        .into_iter()
        .flatten()
        .find(|row| row["localLane"].as_str().map(str::trim) == Some(id))
        .ok_or_else(|| invalid("inbound lane alias not tracked"))?;
    let remote_scope = row["remoteScope"]
        .as_str()
        .map(str::trim)
        .filter(|val| !val.is_empty())
        .ok_or_else(|| invalid("inbound lane alias scope"))?;
    let remote_lane = row["remoteLane"]
        .as_str()
        .map(str::trim)
        .filter(|val| !val.is_empty())
        .ok_or_else(|| invalid("inbound lane alias name"))?;
    Ok(format!("{remote_scope}/{remote_lane}"))
}

/// Lists tracked remote lane IDs under `refs/remotes` using the platform path separator.
#[inline]
fn tracked(root: &Path) -> io::Result<Vec<String>> {
    tracked_for_separator(root, std::path::MAIN_SEPARATOR)
}

/// Scans `refs/remotes` for tracked remote lane IDs when `separator` is a POSIX forward slash.
fn tracked_for_separator(root: &Path, separator: char) -> io::Result<Vec<String>> {
    // RemoteLanes.listLaneFiles passes path.join('*', '*') to glob 13. On
    // Windows, its backslash escapes the second star and no legal lane matches.
    if separator == '\\' {
        return Ok(Vec::new());
    }
    let base = crate::scope_path(root).join("refs/remotes");
    if fs::symlink_metadata(&base).is_ok_and(|meta| meta.file_type().is_symlink()) {
        return Err(invalid("inbound remote lane symlink"));
    }
    if !base.try_exists()? {
        return Ok(Vec::new());
    }
    let mut ids = Vec::new();
    for scope in fs::read_dir(base)? {
        let scope = scope?;
        if !scope.file_type()?.is_dir() {
            continue;
        }
        let scope_name = scope
            .file_name()
            .into_string()
            .map_err(|_| invalid("inbound remote scope UTF8"))?;
        if !scope_name.trim().is_empty() && !scope_name.starts_with('.') {
            ids.extend(scope_lanes(&scope.path(), &scope_name)?);
        }
    }
    ids.sort_by(|left, right| right.cmp(left));
    if ids.len() > 32 {
        return Err(invalid("inbound implicit lane count"));
    }
    Ok(ids)
}

fn scope_lanes(directory: &Path, scope: &str) -> io::Result<Vec<String>> {
    let scope = scope.trim();
    let mut ids = Vec::new();
    for lane in fs::read_dir(directory)? {
        let lane = lane?;
        if !lane.file_type()?.is_file() {
            continue;
        }
        let name = lane
            .file_name()
            .into_string()
            .map_err(|_| invalid("inbound remote lane UTF8"))?;
        let name = name.trim();
        if !name.is_empty() && !name.starts_with('.') && !matches!(name, "main" | "master") {
            ids.push(format!("{scope}/{name}"));
        }
    }
    Ok(ids)
}
