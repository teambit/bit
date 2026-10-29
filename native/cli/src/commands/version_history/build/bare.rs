//! Reconstruct qualified local-scope history and publish it atomically.
mod lanes;
#[cfg(test)]
mod tests;
use super::{Chalk, Formatter, Outcome, ScopeRoot, Value, resolve_component_entry, sha1_hex};
use crate::commands::workspace_command::{self, filesystem_error, results::Report};
use flate2::{Compression, write::ZlibEncoder};
use serde_json::json;
use std::{
    collections::HashSet,
    ffi::OsString,
    fs::{self, OpenOptions},
    io::{self, Write},
    path::{Path, PathBuf},
};

pub(super) struct Plan {
    path: PathBuf,
    identity: String,
    payload: Vec<u8>,
    proofs: Vec<(PathBuf, Vec<u8>)>,
    count: usize,
    mode: Option<u32>,
}

pub(super) fn prepare(
    root: &ScopeRoot,
    id: &str,
    from: Option<&str>,
    all_lanes: bool,
) -> Option<Plan> {
    if !super::supported_startup(root, &root.path)? {
        return None;
    }
    let (scope, name, model_hash) = resolve_component_entry(&root.path, id)?;
    let scope = scope?;
    let mut proofs = metadata_proofs(&root.path, &scope, false)?;
    if all_lanes && !lanes::unrelated_lanes(&root.path, &scope, &name, &mut proofs)? {
        return None;
    }
    let model = read(&root.path, &model_hash, "Component", &mut proofs)?;
    let head = from.or_else(|| model["head"].as_str())?;
    let hash = sha1_hex(&format!("{scope}/{name}:VersionHistory"));
    let path = object_path(&root.path, &hash)?;
    if !safe_parent(&root.path, &path) {
        return None;
    }
    let (existing, mode) = stored(&root.path, &hash, &path, &mut proofs)?;
    if existing
        .as_ref()
        .is_some_and(|value| super::complete(value, head) != Some(false))
    {
        return None;
    }
    let output = content(&root.path, &hash, head, &name, &scope, existing.as_ref(), &mut proofs)?;
    Some(Plan {
        path,
        identity: format!("{scope}/{name}"),
        payload: output.0,
        proofs,
        count: output.1,
        mode,
    })
}

fn content(
    root: &Path,
    hash: &str,
    head: &str,
    name: &str,
    scope: &str,
    existing: Option<&Value>,
    proofs: &mut Vec<(PathBuf, Vec<u8>)>,
) -> Option<(Vec<u8>, usize)> {
    let rows = ancestry(root, head, proofs)?;
    let (rows, count) = merge(existing, rows, name, scope)?;
    let value = json!({"name":name,"scope":scope,"versions":rows,"graphCompleteRefs":[]});
    Some((encode(hash, &value).ok()?, count))
}

fn stored(
    root: &Path,
    hash: &str,
    path: &Path,
    proofs: &mut Vec<(PathBuf, Vec<u8>)>,
) -> Option<(Option<Value>, Option<u32>)> {
    if absent(path) {
        return Some((None, None));
    }
    let mode = existing_mode(path)?;
    Some((Some(read(root, hash, "VersionHistory", proofs)?), Some(mode)))
}

#[cfg(unix)]
fn existing_mode(path: &Path) -> Option<u32> {
    use std::os::unix::fs::MetadataExt;
    let metadata = fs::symlink_metadata(path).ok()?;
    // SAFETY: these process identity queries have no arguments or side effects.
    let uid = unsafe { libc::geteuid() };
    // SAFETY: these process identity queries have no arguments or side effects.
    let gid = unsafe { libc::getegid() };
    let parent = fs::metadata(path.parent()?).ok()?;
    if !metadata.is_file()
        || metadata.file_type().is_symlink()
        || metadata.uid() != uid
        || metadata.gid() != gid
        || (parent.mode() & 0o2000 != 0 && parent.gid() != gid)
    {
        return None;
    }
    Some(metadata.mode() & 0o7777)
}

#[cfg(not(unix))]
fn existing_mode(_path: &Path) -> Option<u32> {
    None
}

fn merge(
    existing: Option<&Value>,
    ancestors: Vec<Value>,
    name: &str,
    scope: &str,
) -> Option<(Vec<Value>, usize)> {
    let Some(existing) = existing else {
        let count = ancestors.len();
        return Some((ancestors, count));
    };
    if existing["name"] != name
        || existing["scope"] != scope
        || !existing["graphCompleteRefs"].as_array()?.is_empty()
    {
        return None;
    }
    let mut rows = existing["versions"].as_array()?.clone();
    if rows
        .iter()
        .any(|row| !ancestors.contains(row))
    {
        return None;
    }
    let count = ancestors.len() - usize::from(rows.contains(&ancestors[0]));
    for row in ancestors {
        if !rows.contains(&row) {
            rows.push(row);
        }
    }
    Some((rows, count))
}

fn metadata_proofs(root: &Path, scope: &str, all_lanes: bool) -> Option<Vec<(PathBuf, Vec<u8>)>> {
    let config_path = root.join("scope.json");
    let config_bytes = fs::read(&config_path).ok()?;
    let config: Value = serde_json::from_slice(&config_bytes).ok()?;
    if config["name"].as_str() != Some(scope) || !config["groupName"].is_null() {
        return None;
    }
    let index_path = root.join("index.json");
    let index_bytes = fs::read(&index_path).ok()?;
    if all_lanes
        && !serde_json::from_slice::<Value>(&index_bytes).ok()?["lanes"].as_array()?.is_empty()
    {
        return None;
    }
    Some(vec![(config_path, config_bytes), (index_path, index_bytes)])
}

fn absent(path: &Path) -> bool {
    matches!(fs::symlink_metadata(path), Err(error) if error.kind() == io::ErrorKind::NotFound)
}

fn safe_parent(root: &Path, path: &Path) -> bool {
    for directory in [root.join("objects"), path.parent().unwrap().to_owned()] {
        match fs::symlink_metadata(directory) {
            Ok(metadata) if metadata.is_dir() && !metadata.file_type().is_symlink() => {}
            Err(error) if error.kind() == io::ErrorKind::NotFound => {}
            _ => return false,
        }
    }
    true
}

fn ancestry(root: &Path, head: &str, proofs: &mut Vec<(PathBuf, Vec<u8>)>) -> Option<Vec<Value>> {
    let mut pending = vec![(head.to_owned(), false)];
    let mut seen = HashSet::new();
    let mut active = HashSet::new();
    let mut rows = Vec::new();
    while let Some((current, leaving)) = pending.pop() {
        if leaving {
            active.remove(&current);
            seen.insert(current);
            continue;
        }
        if active.contains(&current) {
            return None;
        }
        if seen.contains(&current) {
            continue;
        }
        if seen.len() + active.len() >= 128 {
            return None;
        }
        active.insert(current.clone());
        let (parents, row) = version_parents(root, &current, proofs)?;
        rows.push(row);
        pending.push((current, true));
        pending.extend(
            parents
                .into_iter()
                .rev()
                .map(|parent| (parent, false)),
        );
    }
    Some(rows)
}

fn version_parents(
    root: &Path,
    hash: &str,
    proofs: &mut Vec<(PathBuf, Vec<u8>)>,
) -> Option<(Vec<String>, Value)> {
    let version = read(root, hash, "Version", proofs)?;
    let parents = version["parents"].as_array()?;
    if parents.len() > 8 {
        return None;
    }
    let parents: Vec<String> = parents
        .iter()
        .map(|parent| Some(parent.as_str()?.to_owned()))
        .collect::<Option<_>>()?;
    let mut row = json!({"hash":hash,"parents":parents});
    for (field, key) in [("unrelated", "head"), ("squashed", "previousParents")] {
        if version[field].is_null() {
            continue;
        }
        let data = &version[field];
        data["laneId"]["name"].as_str()?;
        data["laneId"]["scope"].as_str()?;
        let refs = if field == "unrelated" {
            vec![data[key].as_str()?]
        } else {
            data[key]
                .as_array()?
                .iter()
                .map(Value::as_str)
                .collect::<Option<Vec<_>>>()?
        };
        if refs.len() > 128
            || refs
                .iter()
                .any(|hash| object_path(root, hash).is_none())
        {
            return None;
        }
        row[field] = data[key].clone();
    }
    Some((parents, row))
}

fn object_path(root: &Path, hash: &str) -> Option<PathBuf> {
    if hash.len() != 40 || !hash.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return None;
    }
    Some(
        root.join("objects")
            .join(&hash[..2])
            .join(&hash[2..]),
    )
}

fn read(
    root: &Path,
    hash: &str,
    kind: &str,
    proofs: &mut Vec<(PathBuf, Vec<u8>)>,
) -> Option<Value> {
    let path = object_path(root, hash)?;
    let metadata = fs::symlink_metadata(&path).ok()?;
    if !metadata.is_file() || metadata.file_type().is_symlink() {
        return None;
    }
    let bytes = fs::read(&path).ok()?;
    let (actual, value) = bit_object_import::read_scope_object(root, hash).ok()??;
    if actual != kind || fs::read(&path).ok()? != bytes {
        return None;
    }
    proofs.push((path, bytes));
    Some(value)
}

fn encode(hash: &str, value: &Value) -> io::Result<Vec<u8>> {
    let body = serde_json::to_vec(value)?;
    let length = String::from_utf8_lossy(&body).encode_utf16().count();
    let mut encoder = ZlibEncoder::new(Vec::new(), Compression::default());
    write!(encoder, "VersionHistory {hash} {length}\0")?;
    encoder.write_all(&body)?;
    encoder.finish()
}

impl Plan {
    pub fn run(self, root: &ScopeRoot, args: &[OsString]) -> io::Result<Outcome> {
        let chalk = Chalk::detect(args);
        workspace_command::execute_then_scope(&root.path, args, "build", |_| {
            self.publish().map_err(|error| filesystem_error::report(&error, chalk))?;
            let summary =
                Formatter::new(chalk).success_summary("completed building version history");
            Ok(Report {
                data: format!(
                    "{summary}\n{}: added {} hashes",
                    chalk.bold(&self.identity),
                    self.count,
                ),
                code: 0,
                details: None,
            })
        })
    }

    fn publish(&self) -> io::Result<()> {
        for (path, bytes) in &self.proofs {
            if fs::read(path)? != *bytes {
                return Err(io::Error::other("version-history input changed"));
            }
        }
        if self.mode.is_none() && !absent(&self.path) {
            return Err(io::Error::other("version-history appeared"));
        }
        if self.mode.is_some() && existing_mode(&self.path) != self.mode {
            return Err(io::Error::other("version-history mode changed"));
        }
        let parent = self.path.parent().ok_or_else(|| io::Error::other("version-history path"))?;
        let temporary = parent.join(format!(
            ".{}.{}.1",
            self.path
                .file_name()
                .unwrap()
                .to_string_lossy(),
            std::process::id(),
        ));
        let mut created = false;
        let result = self.write_temporary(parent, &temporary, &mut created);
        if result.is_err() && created {
            let _ = fs::remove_file(&temporary);
        }
        result
    }

    fn write_temporary(
        &self,
        parent: &Path,
        temporary: &Path,
        created: &mut bool,
    ) -> io::Result<()> {
        let open = || {
            OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(temporary)
        };
        let mut file = match open() {
            Ok(file) => file,
            Err(error) if error.kind() == io::ErrorKind::NotFound => {
                fs::create_dir_all(parent)
                    .map_err(|error| filesystem_error::failure(error, "mkdir", parent))?;
                open().map_err(|error| filesystem_error::failure(error, "open", temporary))?
            }
            Err(error) => return Err(filesystem_error::failure(error, "open", temporary)),
        };
        *created = true;
        file.write_all(&self.payload)
            .map_err(|error| filesystem_error::failure(error, "write", temporary))?;
        preserve_mode(temporary, self.mode)?;
        fs::rename(temporary, &self.path)
            .map_err(|error| {
                filesystem_error::paired_failure(error, "rename", temporary, &self.path)
            })
    }
}

#[cfg(unix)]
fn preserve_mode(path: &Path, mode: Option<u32>) -> io::Result<()> {
    use std::os::unix::fs::PermissionsExt;
    if let Some(mode) = mode {
        fs::set_permissions(path, fs::Permissions::from_mode(mode))
            .map_err(|error| filesystem_error::failure(error, "chmod", path))?;
    }
    Ok(())
}

#[cfg(not(unix))]
fn preserve_mode(_path: &Path, _mode: Option<u32>) -> io::Result<()> {
    Ok(())
}
