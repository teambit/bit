//! Select already-scoped main-lane components and freeze their compressed
//! object closure, or a zero-object repeat export, before remote side effects.

pub(super) mod prefilter;

mod all_versions;
mod candidates;
mod history;
mod repeat;
mod selection;
#[cfg(test)]
mod tests;
use selection::{Staged, has_staged, select_versions};

use super::{
    super::inbound::remote::file_list::{row_id_parts, row_scoped_id_parts},
    Prepare, invalid,
};
use crate::transfer::{self, Body, collection};
use bit_client_transfer::tar::ObjectItem;
use flate2::{Compression, write::ZlibEncoder};
use serde_json::{Value, json};
use std::{
    fs,
    io::{self, Write},
    path::Path,
};

const MAX_BYTES: usize = 32 * 1024 * 1024;

pub(super) struct Selected {
    pub(super) scope: String,
    pub(super) name: String,
    pub(super) model: ModelBytes,
    pub(super) history: HistoryBytes,
    pub(super) head: String,
    /// Each local version's tag or hash, the head's among them.
    pub(super) labels: Vec<String>,
    pub(super) objects: Vec<ObjectItem>,
}

pub(super) struct ModelBytes {
    pub(super) hash: String,
    pub(super) before: Vec<u8>,
    pub(super) after: Vec<u8>,
}

#[derive(Clone)]
pub(super) struct HistoryBytes {
    pub(super) hash: String,
    pub(super) bytes: Vec<u8>,
    pub(super) hashes: Vec<String>,
}

struct Identity {
    scope: String,
    name: String,
    model_hash: String,
}

pub(super) fn selection_history(input: &Prepare) -> io::Result<prefilter::Prepared> {
    if input.options.pattern_selection && !input.options.all && !input.options.all_versions {
        prefilter::prepare(&input.root)
    } else {
        Ok(prefilter::Prepared::default())
    }
}

pub(super) fn select(input: &Prepare) -> io::Result<Vec<Selected>> {
    let scope = crate::parse_jsonc(&fs::read(crate::scope_path(&input.root).join("scope.json"))?)?;
    if scope["lanes"]["current"] != "main" {
        return Err(invalid("outbound lane export"));
    }
    let Some(rows) = read_index_rows(&input.root)? else { return Ok(Vec::new()) };
    let candidates = candidate_rows(input, &rows)?;
    if input.options.pattern_selection && input.ids.is_empty() {
        return Ok(Vec::new());
    }
    let selected = requested(
        &input.ids,
        candidates,
        input.options.all || input.options.all_versions || input.options.head_only,
    )?;
    ensure_explicit_ids_in_bitmap(input, &selected)?;
    selected
        .into_iter()
        .map(|(row, model)| select_one(input, &row, model))
        .collect()
}

fn read_index_rows(root: &Path) -> io::Result<Option<Vec<Value>>> {
    let index_bytes = match fs::read(crate::scope_path(root).join("index.json")) {
        Ok(bytes) => bytes,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(error),
    };
    let index = crate::parse_jsonc(&index_bytes)?;
    let rows = index["components"]
        .as_array()
        .or_else(|| index.as_array())
        .ok_or_else(|| invalid("outbound index"))?;
    Ok(Some(rows.clone()))
}

fn candidate_rows(input: &Prepare, rows: &[Value]) -> io::Result<Vec<(Value, Value)>> {
    if input.options.all
        || input.options.all_versions
        || input.options.head_only
        || !input.ids.is_empty()
    {
        all_rows(&input.root, rows)
    } else {
        staged_rows(&input.root, rows)
    }
}

fn ensure_explicit_ids_in_bitmap(input: &Prepare, selected: &[(Value, Value)]) -> io::Result<()> {
    if input.ids.is_empty() {
        return Ok(());
    }
    let bitmap = crate::recovery::jsonc::parse(&fs::read(input.root.join(".bitmap"))?)?;
    for (row, _) in selected {
        let (scope, name) =
            row_id_parts(row).map_or(("", ""), |(scope, name)| (scope.unwrap_or_default(), name));
        if !super::publication::reconcile_present(&bitmap, scope, name) {
            return Err(invalid("outbound explicit id absent from bitmap"));
        }
    }
    Ok(())
}

fn all_rows(root: &Path, rows: &[Value]) -> io::Result<Vec<(Value, Value)>> {
    rows.iter()
        .filter(|row| row["isSymlink"] != true)
        .map(|row| Ok((row.clone(), load_model(root, row)?)))
        .collect()
}

fn staged_rows(root: &Path, rows: &[Value]) -> io::Result<Vec<(Value, Value)>> {
    let mut staged = Vec::new();
    for row in rows
        .iter()
        .filter(|row| row["isSymlink"] != true)
    {
        let model = load_model(root, row)?;
        if has_staged(&model) {
            staged.push((row.clone(), model));
        }
    }
    Ok(staged)
}

fn requested(
    ids: &[String],
    staged: Vec<(Value, Value)>,
    all_versions: bool,
) -> io::Result<Vec<(Value, Value)>> {
    if ids.is_empty() {
        return Ok(staged);
    }
    let mut chosen: Vec<(Value, Value)> = Vec::new();
    for id in ids {
        if let Some(scope) = scope_pattern(id, &staged) {
            add_scope(&mut chosen, &staged, scope, all_versions);
            continue;
        }
        let component = find_requested(&staged, id)?;
        if chosen
            .iter()
            .any(|(row, _)| row["hash"] == component.0["hash"])
        {
            return Err(invalid("outbound duplicate component"));
        }
        chosen.push(component.clone());
    }
    Ok(chosen)
}

fn add_scope(
    chosen: &mut Vec<(Value, Value)>,
    candidates: &[(Value, Value)],
    scope: &str,
    all_versions: bool,
) {
    for component in candidates
        .iter()
        .filter(|(row, model)| {
            row_scoped_id_parts(row).is_some_and(|(row_scope, _)| row_scope == scope)
                && (all_versions || has_staged(model))
        })
    {
        if !chosen
            .iter()
            .any(|(row, _)| row["hash"] == component.0["hash"])
        {
            chosen.push(component.clone());
        }
    }
}

fn scope_pattern<'a>(id: &'a str, candidates: &[(Value, Value)]) -> Option<&'a str> {
    let trimmed = id.trim();
    let scope = trimmed.strip_suffix("/*").map_or(trimmed, str::trim);
    if scope.is_empty() || scope.contains('/') {
        return None;
    }
    candidates
        .iter()
        .any(|(row, _)| row_scoped_id_parts(row).is_some_and(|(row_scope, _)| row_scope == scope))
        .then_some(scope)
}

/// The staged component `id` (`<identity>[@<version>]`) names, by its full
/// id or, unambiguously, by a slash-free name.
fn find_requested<'s>(staged: &'s [(Value, Value)], id: &str) -> io::Result<&'s (Value, Value)> {
    let id = id.trim();
    let (identity, version) = id
        .rsplit_once('@')
        .map_or((id, None), |(identity, version)| (identity.trim(), Some(version.trim())));
    let matching_version = |model: &Value| {
        version.is_none_or(|version| {
            version.is_empty()
                || matches!(version, "latest" | "head")
                || Some(version) == model["head"].as_str()
                || model["versions"][version]
                    .as_str()
                    .or_else(|| model["orphanedVersions"][version].as_str())
                    == model["head"].as_str()
        })
    };
    let scoped = staged
        .iter()
        .find(|(row, model)| {
            row_scoped_id_parts(row)
                .is_some_and(|(scope, name)| format!("{scope}/{name}") == identity)
                && matching_version(model)
        });
    if let Some(scoped) = scoped {
        return Ok(scoped);
    }
    let unscoped: Vec<&(Value, Value)> = staged
        .iter()
        .filter(|(row, model)| {
            row_id_parts(row).is_some_and(|(_, name)| name == identity) && matching_version(model)
        })
        .collect();
    match unscoped.as_slice() {
        [component] => Ok(component),
        [] => Err(invalid("outbound requested component is not staged")),
        _ => Err(invalid("outbound ambiguous unscoped component")),
    }
}

fn select_one(input: &Prepare, row: &Value, mut model: Value) -> io::Result<Selected> {
    let identity = identity(row, &model)?;
    let objects_dir = crate::scope_path(&input.root).join("objects");
    let staged = select_versions(input, &model, &objects_dir)?;
    let model_before = transfer::object::repository(
        &objects_dir,
        crate::merge_history::hash(&identity.model_hash)?,
        MAX_BYTES,
    )?;
    let history = prepare_history(&objects_dir, &identity.scope, &identity.name, &staged.head)?;
    let host = super::remote::configured_host(input, &identity.scope)?;
    let (model_after, objects) = if staged.hashes.is_empty() {
        (model_before.clone(), Vec::new())
    } else {
        clear_and_mark_exported(&mut model, &identity.scope, &host, &input.transport.export_date)?;
        let model_after = encode(&identity.model_hash, "Component", &model)?;
        let objects = collect(
            &objects_dir,
            &identity.model_hash,
            &model_after,
            &staged.hashes,
            input.options.ignore_missing_artifacts,
        )?;
        (model_after, objects)
    };
    Ok(Selected {
        scope: identity.scope,
        name: identity.name,
        model: ModelBytes { hash: identity.model_hash, before: model_before, after: model_after },
        history,
        head: staged.head,
        labels: staged.labels,
        objects,
    })
}

fn identity(row: &Value, model: &Value) -> io::Result<Identity> {
    let (scope, name) = row_scoped_id_parts(row).ok_or_else(|| invalid("outbound scope"))?;
    let (scope, name) = (scope.to_owned(), name.to_owned());
    if model["scope"] != scope || model["name"] != name {
        return Err(invalid("outbound model identity"));
    }
    let model_hash = row["hash"]
        .as_str()
        .ok_or_else(|| invalid("outbound model hash"))?
        .to_owned();
    Ok(Identity { scope, name, model_hash })
}

fn load_model(root: &Path, row: &Value) -> io::Result<Value> {
    let hash = row["hash"].as_str().ok_or_else(|| invalid("outbound index hash"))?;
    read_object(&crate::scope_path(root).join("objects"), hash, "Component")
}
pub(crate) fn read_object(dir: &Path, hash: &str, kind: &str) -> io::Result<Value> {
    let parsed = crate::merge_history::hash(hash)?;
    let compressed = transfer::object::repository(dir, parsed, MAX_BYTES)?;
    let raw = crate::checkout::repository::inflate(&compressed, MAX_BYTES)?;
    let (_, body) = crate::checkout::repository::split(&raw, parsed, kind)?;
    crate::parse_jsonc(body)
}
pub(super) fn prepare_history(
    dir: &Path,
    scope: &str,
    name: &str,
    head: &str,
) -> io::Result<HistoryBytes> {
    history::prepare_history(dir, scope, name, head)
}

pub(super) fn clear_and_mark_exported(
    model: &mut Value,
    scope: &str,
    host: &str,
    date: &str,
) -> io::Result<()> {
    let rows = model.as_object_mut().ok_or_else(|| invalid("outbound model"))?;
    rows.shift_remove("state");
    rows.shift_remove("local");
    if !rows.get("remotes").is_some_and(Value::is_array) {
        rows.insert("remotes".to_owned(), json!([]));
    }
    let remotes = rows
        .get_mut("remotes")
        .and_then(Value::as_array_mut)
        .ok_or_else(|| invalid("outbound remotes"))?;
    if !remotes
        .iter()
        .any(|row| row["url"] == host)
    {
        remotes.push(json!({"url":host,"name":scope,"date":date}));
    }
    Ok(())
}
pub(crate) fn encode(hash: &str, kind: &str, value: &Value) -> io::Result<Vec<u8>> {
    crate::merge_history::hash(hash)?;
    let body = serde_json::to_string(value).map_err(io::Error::other)?;
    let mut encoder = ZlibEncoder::new(Vec::new(), Compression::default());
    write!(encoder, "{kind} {hash} {}\0{body}", body.encode_utf16().count())?;
    encoder.finish()
}
pub(super) fn collect(
    dir: &Path,
    model_hash: &str,
    model: &[u8],
    hashes: &[String],
    ignore_missing_artifacts: bool,
) -> io::Result<Vec<ObjectItem>> {
    let versions = hashes
        .iter()
        .map(|hash| {
            Ok(collection::Version {
                hash: crate::merge_history::hash(hash)?,
                locally_changed: true,
                expected: None,
            })
        })
        .collect::<io::Result<Vec<_>>>()?;
    let descriptors = collection::select(
        dir,
        &versions,
        None,
        0,
        &collection::Mode::Export { strict_local_artifacts: !ignore_missing_artifacts },
    )?;
    let mut objects =
        vec![ObjectItem { hash: model_hash.to_owned(), compressed: model.to_vec(), scope: None }];
    let mut budget = model.len();
    for descriptor in descriptors {
        if matches!(descriptor.body, Body::Metadata(_)) {
            return Err(invalid("outbound inline object"));
        }
        let (compressed, _, _) =
            transfer::object::read(dir, &descriptor, MAX_BYTES.saturating_sub(budget))?;
        budget += compressed.len();
        objects.push(ObjectItem {
            hash: crate::validate::hexadecimal(&descriptor.hash),
            compressed,
            scope: None,
        });
    }
    if budget > MAX_BYTES || objects.len() > 4095 {
        return Err(invalid("outbound object budget"));
    }
    Ok(objects)
}

pub(super) fn candidates(root: &Path, all: bool) -> io::Result<Value> {
    candidates::read(root, all)
}
