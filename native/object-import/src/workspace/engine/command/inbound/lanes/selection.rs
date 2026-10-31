//! `ImporterMain.fetch` resolves tracked aliases and implicit remote lane refs.
#[cfg(test)]
mod tests;
use super::super::{Prepare, config, invalid};
use std::{fs, io, path::Path};

pub(super) fn ids(input: &Prepare) -> io::Result<Vec<String>> {
    if input.ids.is_empty() {
        return tracked(&input.root);
    }
    let scope = config::document(&crate::scope_path(&input.root).join("scope.json"))?;
    input.ids
        .iter()
        .map(String::as_str)
        .map(str::trim)
        .filter(|id| !id.is_empty() && *id != "main")
        .map(|id| {
            if id.contains('/') {
                return Ok(id.to_owned());
            }
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
        })
        .collect()
}

fn tracked(root: &Path) -> io::Result<Vec<String>> {
    tracked_for_separator(root, std::path::MAIN_SEPARATOR)
}

fn tracked_for_separator(root: &Path, separator: char) -> io::Result<Vec<String>> {
    // RemoteLanes.listLaneFiles passes path.join('*', '*') to glob 13. On
    // Windows, its backslash escapes the second star and no legal lane matches.
    if separator == '\\' {
        return Ok(Vec::new());
    }
    let base = crate::scope_path(root).join("refs/remotes");
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
        ids.extend(scope_lanes(&scope.path(), &scope_name)?);
    }
    ids.sort_by(|left, right| right.cmp(left));
    if ids.len() > 32 {
        return Err(invalid("inbound implicit lane count"));
    }
    Ok(ids)
}

fn scope_lanes(directory: &Path, scope: &str) -> io::Result<Vec<String>> {
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
            ids.push(format!("{}/{name}", scope.trim()));
        }
    }
    Ok(ids)
}
