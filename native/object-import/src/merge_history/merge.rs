pub(crate) mod git;
pub(crate) use verified::verified;
mod verified;
use super::{MAX_RAW, count, hash, invalid, path};
use git::{MergeBytes, git};
use workers::classify_all;
mod workers;
use serde::Deserialize;
use serde_json::{Value, json};
use sha1::{Digest, Sha1};
use std::{
    collections::{HashMap, HashSet},
    fs,
    io::{self, Read},
    path::PathBuf,
    sync::atomic::{AtomicUsize, Ordering},
};
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Request {
    objects_directory: PathBuf,
    labels: Labels,
    base: Vec<Model>,
    other: Vec<Model>,
    current: Vec<Current>,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Labels {
    current: String,
    other: String,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Model {
    path: String,
    hash: String,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Current {
    path: String,
    workspace: Option<Workspace>,
    source: Option<Source>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Workspace {
    path: PathBuf,
    hash: String,
    linux_hash: String,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Source {
    hash: String,
}
static NEXT: AtomicUsize = AtomicUsize::new(0);
struct Directory(PathBuf);
impl Directory {
    fn new() -> io::Result<Self> {
        for _ in 0..64 {
            let name = std::env::temp_dir()
                .join(format!(
                    "bit-merge-{}-{}",
                    std::process::id(),
                    NEXT.fetch_add(1, Ordering::Relaxed),
                ));
            match fs::create_dir(&name) {
                Ok(()) => return Ok(Self(name)),
                Err(error) if error.kind() == io::ErrorKind::AlreadyExists => continue,
                Err(error) => return Err(error),
            }
        }
        Err(invalid("merge temporary directory unavailable"))
    }
}
impl Drop for Directory {
    fn drop(&mut self) {
        let _cleanup = fs::remove_dir_all(&self.0);
    }
}
struct Owned {
    base: Vec<Vec<u8>>,
    other: Vec<Vec<u8>>,
    current: Vec<Vec<u8>>,
}
pub(crate) struct Prepared<'a> {
    pub(crate) base: Vec<&'a [u8]>,
    pub(crate) other: Vec<&'a [u8]>,
    pub(crate) current: Vec<&'a [u8]>,
}
impl Owned {
    fn borrowed(&self) -> Prepared<'_> {
        Prepared {
            base: self.base
                .iter()
                .map(Vec::as_slice)
                .collect(),
            other: self.other
                .iter()
                .map(Vec::as_slice)
                .collect(),
            current: self.current
                .iter()
                .map(Vec::as_slice)
                .collect(),
        }
    }
}
struct Execution<'a> {
    request: &'a Request,
    prepared: &'a Prepared<'a>,
    base: HashMap<&'a str, usize>,
    other: HashMap<&'a str, usize>,
    directory: Directory,
    output: AtomicUsize,
    wire_bodies: bool,
}
pub(super) fn merge(request: &Request) -> io::Result<Value> {
    let prepared = preflight(request)?;
    execute(request, &prepared.borrowed(), true)
}
fn execute(request: &Request, prepared: &Prepared<'_>, wire_bodies: bool) -> io::Result<Value> {
    let execution = Execution {
        request,
        prepared,
        directory: Directory::new()?,
        output: AtomicUsize::new(0),
        wire_bodies,
        base: request.base
            .iter()
            .enumerate()
            .map(|(index, file)| (file.path.as_str(), index))
            .collect(),
        other: request.other
            .iter()
            .enumerate()
            .map(|(index, file)| (file.path.as_str(), index))
            .collect(),
    };
    let mut rows = classify_all(&execution)?;
    rows.extend(missing(request, prepared, &execution.base, wire_bodies));
    let conflicts = rows
        .iter()
        .any(|row| {
            row.get("conflict")
                .is_some_and(|value| {
                    value
                        .as_str()
                        .is_some_and(|text| !text.is_empty())
                })
                || row.get("isBinaryConflict") == Some(&Value::Bool(true))
        });
    Ok(json!({"files":rows,"hasConflicts":conflicts}))
}
fn preflight(request: &Request) -> io::Result<Owned> {
    path(&request.objects_directory)?;
    count(request.current.len())?;
    count(request.base.len())?;
    count(request.other.len())?;
    text(&request.labels.current)?;
    text(&request.labels.other)?;
    let mut total = 0;
    let mut compressed = 0;
    let base = load_models(&request.base, request, &mut total, &mut compressed)?;
    let other = load_models(&request.other, request, &mut total, &mut compressed)?;
    let mut current = Vec::new();
    let mut seen = std::collections::HashSet::new();
    for file in &request.current {
        text(&file.path)?;
        if !seen.insert(&file.path) {
            return Err(invalid("merge duplicate current path"));
        }
        let bytes = read_current(file, request, &mut total, &mut compressed)?;
        current.push(bytes);
    }
    Ok(Owned { base, other, current })
}
fn read_current(
    file: &Current,
    request: &Request,
    total: &mut usize,
    compressed: &mut usize,
) -> io::Result<Vec<u8>> {
    match (&file.workspace, &file.source) {
        (Some(workspace), None) => workspace_bytes(workspace, total),
        (None, Some(source)) => Ok(crate::checkout::eol::normalize(
            load(&source.hash, request, total, compressed)?,
            false,
        )),
        _ => Err(invalid("merge unsupported current input")),
    }
}
fn workspace_bytes(workspace: &Workspace, total: &mut usize) -> io::Result<Vec<u8>> {
    path(&workspace.path)?;
    hash(&workspace.hash)?;
    hash(&workspace.linux_hash)?;
    if !fs::symlink_metadata(&workspace.path)?.is_file() {
        return Err(invalid("merge workspace type"));
    }
    let file = fs::File::open(&workspace.path)?;
    if !file.metadata()?.is_file() || file.metadata()?.len() > (MAX_RAW - *total) as u64 {
        return Err(invalid("merge raw limit"));
    }
    let mut raw = Vec::new();
    file.take((MAX_RAW - *total + 1) as u64)
        .read_to_end(&mut raw)?;
    if raw.len() > MAX_RAW - *total || digest(&raw) != workspace.hash {
        return Err(invalid("merge workspace snapshot changed"));
    }
    *total += raw.len();
    let raw = if raw.starts_with(b"\xef\xbb\xbf") { raw[3..].to_vec() } else { raw };
    let bytes = crate::checkout::eol::normalize(raw, false);
    if digest(&bytes) != workspace.linux_hash {
        return Err(invalid("merge Linux snapshot changed"));
    }
    Ok(bytes)
}
fn category(current: &str, base: Option<&Model>, other: Option<&Model>) -> &'static str {
    let Some(other) = other else {
        return match base {
            None => "addFiles",
            Some(base) if current == base.hash => "removeFiles",
            Some(_) => "deletedConflictFiles",
        };
    };
    if current == other.hash {
        return "unModifiedFiles";
    }
    if base.is_some_and(|base| current == base.hash) {
        return "updatedFiles";
    }
    "modifiedFiles"
}
fn classify(index: usize, file: &Current, execution: &Execution<'_>) -> io::Result<Value> {
    let request = execution.request;
    let base = execution.base.get(file.path.as_str()).copied();
    let other = execution.other.get(file.path.as_str()).copied();
    let current_hash = digest(execution.prepared.current[index]);
    let kind = category(
        &current_hash,
        base.map(|index| &request.base[index]),
        other.map(|index| &request.other[index]),
    );
    let mut row = json!({"kind":kind,"current":index,"currentHash":current_hash});
    if let Some(base) = base {
        row["base"] = json!(base);
    }
    if let Some(other) = other {
        row["other"] = json!(other);
    }
    if kind == "updatedFiles" {
        other_body(&mut row, other.unwrap(), execution.prepared, execution.wire_bodies);
    }
    if kind == "modifiedFiles" {
        row.as_object_mut()
            .unwrap()
            .extend(
                merged(index, base, other.unwrap(), execution)?
                    .as_object()
                    .unwrap()
                    .clone(),
            );
    }
    Ok(row)
}
fn missing(
    request: &Request,
    prepared: &Prepared<'_>,
    base_indices: &HashMap<&str, usize>,
    wire_bodies: bool,
) -> Vec<Value> {
    let current_paths: HashSet<&str> = request.current
        .iter()
        .map(|file| file.path.as_str())
        .collect();
    let mut deleted = Vec::new();
    let mut conflicts = Vec::new();
    let mut added = Vec::new();
    let mut loaded = Vec::new();
    for (index, file) in request.other.iter().enumerate() {
        if current_paths.contains(file.path.as_str()) {
            continue;
        }
        let base = base_indices.get(file.path.as_str()).copied();
        let Some(base) = base else {
            let mut row = json!({"kind":"addFiles","other":index});
            other_body(&mut row, index, prepared, wire_bodies);
            added.push(row);
            continue;
        };
        if request.base[base].hash == file.hash {
            deleted.push(json!({"kind":"remainDeletedFiles","other":index,"base":base}));
            continue;
        }
        conflicts.push(json!({"kind":"deletedConflictFiles","other":index,"base":base}));
        let mut row = json!({"kind":"deletedConflictFiles","other":index,"base":base});
        other_body(&mut row, index, prepared, wire_bodies);
        loaded.push(row);
    }
    deleted.extend(conflicts);
    deleted.extend(added);
    deleted.extend(loaded);
    deleted
}
fn text(text: &str) -> io::Result<()> {
    if text.len() > 32768 || text.contains('\0') {
        Err(invalid("merge label/path limit"))
    } else {
        Ok(())
    }
}
fn digest(bytes: &[u8]) -> String {
    crate::validate::hexadecimal(&Sha1::digest(bytes))
}
fn load_models(
    files: &[Model],
    request: &Request,
    total: &mut usize,
    compressed: &mut usize,
) -> io::Result<Vec<Vec<u8>>> {
    let mut seen = std::collections::HashSet::new();
    files
        .iter()
        .map(|file| {
            text(&file.path)?;
            if !seen.insert(&file.path) {
                return Err(invalid("merge duplicate model path"));
            }
            load(&file.hash, request, total, compressed)
        })
        .collect()
}
fn load(
    expected: &str,
    request: &Request,
    total: &mut usize,
    compressed: &mut usize,
) -> io::Result<Vec<u8>> {
    let bytes = crate::checkout::repository::source(
        &request.objects_directory,
        hash(expected)?,
        MAX_RAW - *total,
        compressed,
    )?;
    *total += bytes.len();
    Ok(bytes)
}
fn merged(
    index: usize,
    base: Option<usize>,
    other: usize,
    execution: &Execution<'_>,
) -> io::Result<Value> {
    git(
        index,
        MergeBytes {
            current: execution.prepared.current[index],
            base: base
                .map(|index| execution.prepared.base[index])
                .unwrap_or_default(),
            other: execution.prepared.other[other],
        },
        execution.request,
        &execution.directory,
        &execution.output,
    )
}

fn other_body(row: &mut Value, index: usize, prepared: &Prepared<'_>, wire_bodies: bool) {
    if wire_bodies {
        row["body"] = json!(crate::validate::hexadecimal(prepared.other[index]));
    } else {
        row["bodyPlanIndex"] = json!(index);
    }
}
