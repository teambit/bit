use std::{
    collections::{HashMap, HashSet},
    io::{self, Read, Write},
    path::{Path, PathBuf},
};

use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::{MAX_BYTES, MAX_PATH, cache, invalid, repository};
use crate::protocol;

const MAX_JSON: usize = 4 * 1024 * 1024;
const MAX_FILES: usize = 4096;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Request {
    objects_directory: PathBuf,
    component_hash: String,
    requested_version: String,
    expected_version_hash: String,
    current: Vec<Current>,
    expected_files: Vec<ManifestFile>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Current {
    relative_path: String,
    hash: String,
    path: PathBuf,
    protected: bool,
}
#[derive(Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ManifestFile {
    hash: String,
    relative_path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    test: Option<bool>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Plan {
    version_hash: String,
    files: Vec<ManifestFile>,
    statuses: Vec<FileStatus>,
    removals: Vec<PathBuf>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct FileStatus {
    relative_path: String,
    status: &'static str,
}
#[derive(Serialize)]
struct Response {
    version: u8,
    id: u32,
    completed: usize,
    skipped: Vec<usize>,
    failed: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    plan: Option<Plan>,
}

/// Resolve a repository target, verify the complete manifest and Source set, and
/// plan statuses/removals against caller-owned current snapshots without writes.
pub(crate) fn serve(
    reader: &mut impl Read,
    writer: &mut impl Write,
    state: &mut cache::State,
) -> io::Result<()> {
    let id = protocol::word(reader)?;
    let length = protocol::word(reader)? as usize;
    if length == 0 || length > MAX_JSON {
        return Err(invalid("checkout plan JSON bytes out of bounds"));
    }
    let mut bytes = vec![0; length];
    reader.read_exact(&mut bytes)?;
    let plan = parse_request(&bytes).and_then(|request| build(&request, state)).ok();
    let completed = plan.as_ref().map_or(0, |plan| plan.files.len());
    let response =
        Response { version: 1, id, completed, skipped: Vec::new(), failed: plan.is_none(), plan };
    let bytes = serde_json::to_vec(&response).map_err(io::Error::other)?;
    if bytes.len() > MAX_JSON {
        return protocol::respond(
            writer,
            &Response {
                version: 1,
                id,
                completed: 0,
                skipped: Vec::new(),
                failed: true,
                plan: None,
            },
        );
    }
    writer.write_all(&bytes)?;
    writer.write_all(b"\n")?;
    writer.flush()
}

fn parse_request(bytes: &[u8]) -> io::Result<Request> {
    let value: Value =
        serde_json::from_slice(bytes).map_err(|_| invalid("checkout plan invalid JSON"))?;
    let files = value
        .get("expectedFiles")
        .and_then(Value::as_array)
        .ok_or_else(|| invalid("checkout plan missing expected files"))?;
    for file in files {
        optional_metadata(file)?;
    }
    serde_json::from_value(value).map_err(|_| invalid("checkout plan unsupported request fields"))
}

fn build(request: &Request, state: &mut cache::State) -> io::Result<Plan> {
    validate(request)?;
    let mut compressed_total = 0;
    let component = metadata(
        &request.objects_directory,
        hash(&request.component_hash)?,
        "Component",
        &mut compressed_total,
    )?;
    let version_hash = resolve(&component, &request.requested_version)?;
    if version_hash != request.expected_version_hash {
        return Err(invalid("checkout plan target Version changed"));
    }
    let version = metadata(
        &request.objects_directory,
        hash(&version_hash)?,
        "Version",
        &mut compressed_total,
    )?;
    let files = manifest(&version)?;
    if !same_manifest(&files, &request.expected_files) {
        return Err(invalid("checkout plan live manifest changed"));
    }
    let files = request.expected_files.clone();
    preflight(&request.objects_directory, &files, &mut compressed_total, state)?;
    Ok(compare(request, version_hash, files))
}

fn same_manifest(stored: &[ManifestFile], live: &[ManifestFile]) -> bool {
    if stored.len() != live.len() {
        return false;
    }
    let records: HashMap<_, _> = stored
        .iter()
        .map(|file| (file.relative_path.as_str(), file))
        .collect();
    live.iter()
        .all(|file| records.get(file.relative_path.as_str()).copied() == Some(file))
}

fn validate(request: &Request) -> io::Result<()> {
    absolute_path(&request.objects_directory)?;
    hash(&request.component_hash)?;
    hash(&request.expected_version_hash)?;
    if request.current.len() > MAX_FILES || request.expected_files.len() > MAX_FILES {
        return Err(invalid("checkout plan file count out of bounds"));
    }
    let mut current = HashSet::new();
    for file in &request.current {
        relative_path(&file.relative_path)?;
        absolute_path(&file.path)?;
        hash(&file.hash)?;
        if !current.insert(&file.relative_path) {
            return Err(invalid("checkout plan duplicate current file"));
        }
    }
    validate_files(&request.expected_files)
}

fn validate_files(files: &[ManifestFile]) -> io::Result<()> {
    if files.len() > MAX_FILES {
        return Err(invalid("checkout plan manifest file count out of bounds"));
    }
    let mut paths = HashSet::new();
    for file in files {
        hash(&file.hash)?;
        relative_path(&file.relative_path)?;
        if !paths.insert(&file.relative_path) {
            return Err(invalid("checkout plan duplicate manifest file"));
        }
        if file.name
            .as_ref()
            .is_some_and(|name| name.contains('\0') || name.len() > MAX_PATH)
        {
            return Err(invalid("checkout plan invalid file name"));
        }
    }
    Ok(())
}

fn hash(value: &str) -> io::Result<[u8; 20]> {
    if value.len() != 40
        || !value
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
    {
        return Err(invalid("checkout plan invalid object hash"));
    }
    let mut hash = [0; 20];
    for (index, byte) in hash.iter_mut().enumerate() {
        *byte = u8::from_str_radix(&value[index * 2..index * 2 + 2], 16)
            .map_err(|_| invalid("checkout plan invalid hash"))?;
    }
    Ok(hash)
}

fn absolute_path(path: &Path) -> io::Result<()> {
    let name = path.to_str().ok_or_else(|| invalid("checkout plan path is not UTF-8"))?;
    if !path.is_absolute() || name.contains('\0') || name.len() > MAX_PATH {
        return Err(invalid("checkout plan invalid absolute path"));
    }
    Ok(())
}

fn relative_path(path: &str) -> io::Result<()> {
    if path.is_empty() || path.len() > MAX_PATH || path.contains(['\0', '\\', ':']) {
        return Err(invalid("checkout plan invalid relative path"));
    }
    for segment in path.split('/') {
        if matches!(segment, "" | "." | ".." | "__proto__" | "constructor" | "prototype") {
            return Err(invalid("checkout plan unsupported relative path segment"));
        }
    }
    Ok(())
}

fn metadata(
    directory: &Path,
    hash: [u8; 20],
    kind: &str,
    compressed_total: &mut usize,
) -> io::Result<Value> {
    let object = repository::read(directory, hash, MAX_JSON + 256, compressed_total)?;
    let (size, body) = repository::split(&object, hash, kind)?;
    if size.parse::<usize>().is_err() || body.len() > MAX_JSON {
        return Err(invalid("checkout plan invalid metadata size"));
    }
    let value: Value =
        serde_json::from_slice(body).map_err(|_| invalid("checkout plan invalid metadata JSON"))?;
    if !value.is_object() {
        return Err(invalid("checkout plan metadata must be an object"));
    }
    Ok(value)
}

fn resolve(component: &Value, requested: &str) -> io::Result<String> {
    if hash(requested).is_ok() {
        return Ok(requested.to_owned());
    }
    if !plain_tag(requested) {
        return Err(invalid("checkout plan requires explicit tag or full hash"));
    }
    let orphaned = component.get("orphanedVersions").and_then(Value::as_object);
    let versions = component
        .get("versions")
        .and_then(Value::as_object)
        .ok_or_else(|| invalid("checkout plan Component versions missing"))?;
    let value = orphaned
        .and_then(|versions| versions.get(requested))
        .or_else(|| versions.get(requested))
        .and_then(Value::as_str)
        .ok_or_else(|| invalid("checkout plan requested tag missing"))?;
    hash(value)?;
    Ok(value.to_owned())
}

fn plain_tag(tag: &str) -> bool {
    if tag.len() > 256 {
        return false;
    }
    let (base, build) = tag
        .split_once('+')
        .map_or((tag, None), |(base, build)| (base, Some(build)));
    let (version, prerelease) = base
        .split_once('-')
        .map_or((base, None), |(version, prerelease)| (version, Some(prerelease)));
    let segments: Vec<_> = version.split('.').collect();
    segments.len() == 3
        && segments.iter().all(|segment| numeric_segment(segment))
        && prerelease.is_none_or(|value| identifiers(value, true))
        && build.is_none_or(|value| identifiers(value, false))
}
fn numeric_segment(value: &str) -> bool {
    !value.is_empty()
        && (value.len() == 1 || !value.starts_with('0'))
        && value.bytes().all(|byte| byte.is_ascii_digit())
        && value
            .parse::<u64>()
            .is_ok_and(|number| number <= 9_007_199_254_740_991)
}
fn identifiers(value: &str, numeric_strict: bool) -> bool {
    value
        .split('.')
        .all(|segment| {
            !segment.is_empty()
                && segment
                    .bytes()
                    .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-')
                && (!numeric_strict
                    || !segment.bytes().all(|byte| byte.is_ascii_digit())
                    || numeric_segment(segment))
        })
}

fn manifest(version: &Value) -> io::Result<Vec<ManifestFile>> {
    let values = version
        .get("files")
        .and_then(Value::as_array)
        .ok_or_else(|| invalid("checkout plan Version files missing"))?;
    if values.len() > MAX_FILES {
        return Err(invalid("checkout plan Version file count out of bounds"));
    }
    let mut files = Vec::with_capacity(values.len());
    for value in values {
        optional_metadata(value)?;
        let object =
            value.as_object().ok_or_else(|| invalid("checkout plan invalid Version file"))?;
        if object
            .keys()
            .any(|key| !matches!(key.as_str(), "file" | "relativePath" | "name" | "test"))
        {
            return Err(invalid("checkout plan unsupported Version file fields"));
        }
        let mut projected = object.clone();
        let hash = projected
            .remove("file")
            .ok_or_else(|| invalid("checkout plan Version Source missing"))?;
        projected.insert("hash".into(), hash);
        files.push(
            serde_json::from_value(Value::Object(projected))
                .map_err(|_| invalid("checkout plan invalid Version manifest"))?,
        );
    }
    validate_files(&files)?;
    Ok(files)
}

fn optional_metadata(file: &Value) -> io::Result<()> {
    if file
        .get("name")
        .is_some_and(|value| !value.is_string())
        || file
            .get("test")
            .is_some_and(|value| !value.is_boolean())
    {
        return Err(invalid("checkout plan unsupported file metadata"));
    }
    Ok(())
}

fn preflight(
    directory: &Path,
    files: &[ManifestFile],
    compressed_total: &mut usize,
    state: &mut cache::State,
) -> io::Result<()> {
    let mut total = 0;
    for file in files {
        let bytes =
            repository::source(directory, hash(&file.hash)?, MAX_BYTES - total, compressed_total)?;
        total += bytes.len();
        state.insert(directory, hash(&file.hash)?, bytes);
    }
    Ok(())
}

fn compare(request: &Request, version_hash: String, files: Vec<ManifestFile>) -> Plan {
    let current: HashMap<_, _> = request.current
        .iter()
        .map(|file| (file.relative_path.as_str(), file.hash.as_str()))
        .collect();
    let mut statuses: Vec<_> = files
        .iter()
        .map(|file| FileStatus {
            relative_path: file.relative_path.clone(),
            status: if current.get(file.relative_path.as_str()).copied() == Some(file.hash.as_str())
            {
                "unchanged"
            } else {
                "updated"
            },
        })
        .collect();
    let target: HashSet<_> = files
        .iter()
        .map(|file| file.relative_path.as_str())
        .collect();
    let mut removals = Vec::new();
    for file in &request.current {
        if !file.protected && !target.contains(file.relative_path.as_str()) {
            statuses.push(FileStatus {
                relative_path: file.relative_path.clone(),
                status: "removed",
            });
            removals.push(file.path.clone());
        }
    }
    Plan { version_hash, files, statuses, removals }
}

#[cfg(test)]
mod tests;
