use super::{Batch, REMOVE, Value, invalid, required, unsupported};
use std::{collections::HashSet, io};
pub(super) fn index(batch: &mut Batch) -> io::Result<Value> {
    let path = crate::scope_path(&batch.root).join("index.json");
    batch.proofs
        .read(&path)?
        .map_or_else(
            || Ok(serde_json::json!({"components":[],"lanes":[]})),
            |bytes| crate::parse_jsonc(&bytes),
        )
}
pub(super) fn object(batch: &mut Batch, hash: &str, kind: &str) -> io::Result<Option<Value>> {
    crate::merge_history::hash(hash)?;
    let scope = crate::scope_path(&batch.root);
    let path = scope
        .join("objects")
        .join(&hash[..2])
        .join(&hash[2..]);
    let Some(_) = batch.proofs.read(&path)? else { return Ok(None) };
    let (actual, value) =
        crate::read_scope_object(&scope, hash)?.ok_or_else(|| invalid("recovery object missing"))?;
    if actual != kind {
        return Err(invalid("recovery object type mismatch"));
    }
    batch.proofs.read(&path)?;
    Ok(Some(value))
}
pub(super) fn model(batch: &mut Batch, bare: &str) -> io::Result<Option<Value>> {
    let index = index(batch)?;
    let rows = index["components"]
        .as_array()
        .or_else(|| index.as_array())
        .ok_or_else(|| invalid("recovery component index"))?;
    let local_name = super::selection::key(&batch.bitmap, bare)?
        .filter(|key| batch.bitmap[key]["scope"].as_str().is_none_or(str::is_empty))
        .and_then(|_| bare.split_once('/').map(|(_, name)| name));
    let rows: Vec<_> = rows
        .iter()
        .filter(|row| {
            let (row_scope, row_name) = row_id_parts(&row["id"]);
            row["isSymlink"] != true
                && (format!("{row_scope}/{row_name}") == bare
                    || (local_name.is_some()
                        && local_name == Some(row_name)
                        && row_scope.is_empty()))
        })
        .collect();
    if rows.len() > 1 {
        return Err(invalid("ambiguous recovery component index"));
    }
    if let Some(row) = rows.first() {
        let hash = row["hash"].as_str().ok_or_else(|| invalid("recovery Component hash"))?;
        return object(batch, hash, "Component");
    }
    fallback_model(batch, bare, local_name)
}

pub(crate) fn row_id_parts(id: &Value) -> (&str, &str) {
    if let Some(raw) = id.as_str() {
        let bare = raw.rsplit_once('@').map_or(raw, |(base, _)| base);
        return bare
            .split_once('/')
            .unwrap_or(("", bare));
    }
    let scope = id["scope"].as_str().unwrap_or_default();
    let name = id["name"]
        .as_str()
        .map(|nm| nm.rsplit_once('@').map_or(nm, |(base, _)| base))
        .unwrap_or_default();
    (scope, name)
}

fn fallback_model(
    batch: &mut Batch,
    bare: &str,
    local_name: Option<&str>,
) -> io::Result<Option<Value>> {
    use sha1::{Digest, Sha1};
    let scoped = crate::validate::hexadecimal(&Sha1::digest(bare.as_bytes()));
    if let Some(model) = object(batch, &scoped, "Component")? {
        return Ok(Some(model));
    }
    if let Some(name) = local_name {
        let unscoped = crate::validate::hexadecimal(&Sha1::digest(name.as_bytes()));
        if let Some(model) = object(batch, &unscoped, "Component")? {
            return Ok(Some(model));
        }
    }
    Ok(None)
}
pub(super) fn lane(batch: &mut Batch) -> io::Result<Option<Value>> {
    let id = batch.bitmap["_bit_lane"]["id"].clone();
    if id.is_null() {
        return Ok(None);
    }
    let index = index(batch)?;
    let empty = Vec::new();
    let rows = if index.is_array() {
        &empty
    } else {
        index["lanes"].as_array().ok_or_else(|| invalid("recovery lane index"))?
    };
    let (target_scope, target_name) = row_id_parts(&id);
    let row = rows
        .iter()
        .find(|row| {
            row["id"] == id
                || (!target_name.is_empty()
                    && row_id_parts(&row["id"]) == (target_scope, target_name))
        })
        .ok_or_else(|| unsupported("recovery current lane unavailable"))?;
    object(batch, row["hash"].as_str().ok_or_else(|| invalid("recovery Lane hash"))?, "Lane")
}
pub(super) fn head(batch: &mut Batch, bare: &str, model: &Value) -> io::Result<Option<String>> {
    if let Some(lane) = lane(batch)? {
        let (scope, name) = bare.split_once('/').ok_or_else(|| invalid("recovery identity"))?;
        if let Some(row) = lane["components"]
            .as_array()
            .and_then(|rows| {
                rows.iter()
                    .find(|row| {
                        let (row_scope, row_name) = row_id_parts(&row["id"]);
                        (row_scope == scope || row_scope.is_empty()) && row_name == name
                    })
            })
        {
            return Ok(row["head"].as_str().map(str::to_owned));
        }
    }
    Ok(model["head"].as_str().map(str::to_owned))
}
pub(super) fn version(batch: &mut Batch, id: &str, model: &Value) -> io::Result<Option<Value>> {
    let (bare, version) = id
        .rsplit_once('@')
        .map_or((id, None), |(id, version)| (id, Some(version)));
    let hash = version
        .filter(|version| !version.is_empty() && !matches!(*version, "latest" | "head"))
        .map(|version| {
            model["versions"][version]
                .as_str()
                .or_else(|| model["orphanedVersions"][version].as_str())
                .unwrap_or(version)
                .to_owned()
        })
        .or(head(batch, bare, model)?);
    hash.map(|hash| object(batch, &hash, "Version"))
        .transpose()
        .map(Option::flatten)
}
pub(in crate::component_recover) fn removal(version: &Value) -> Value {
    version["extensions"]
        .as_array()
        .and_then(|rows| {
            rows.iter()
                .find(|row| {
                    crate::workspace::engine::client_status::config::is_extension_aspect(
                        row, REMOVE,
                    )
                })
        })
        .map_or_else(|| serde_json::json!({}), |row| row["config"].clone())
}
pub(super) fn sources(
    batch: &mut Batch,
    row: &Value,
    version: &Value,
) -> io::Result<Vec<super::File>> {
    let directory = row["rootDir"].as_str().ok_or_else(|| invalid("recovery component root"))?;
    if directory != "." {
        crate::checkout::plan::relative_path(directory)?;
    }
    let directory = batch.root.join(directory);

    let rows = version["files"].as_array().ok_or_else(|| invalid("recovery Version files"))?;
    if rows.len() > 4096 {
        return Err(unsupported("recovery source inventory budget"));
    }
    let mut seen = HashSet::new();
    let mut total = 0;
    rows.iter()
        .map(|row| {
            let relative =
                row["relativePath"].as_str().ok_or_else(|| invalid("recovery source path"))?;
            crate::checkout::plan::relative_path(relative)?;
            if !seen.insert(relative) {
                return Err(invalid("duplicate recovery source path"));
            }
            let hash = row["file"].as_str().ok_or_else(|| invalid("recovery Source hash"))?;
            crate::merge_history::hash(hash)?;
            let Source { path: source, proof, bytes } =
                source(batch, hash, 32 * 1024 * 1024 - total)?;
            total += bytes.len();
            let path = directory.join(relative);
            super::publication::existing_ancestors(batch, &path)?;
            batch.proofs.read(&path)?;
            Ok(super::File { path, bytes, source, proof })
        })
        .collect()
}

struct Source {
    path: std::path::PathBuf,
    proof: Vec<u8>,
    bytes: Vec<u8>,
}
fn source(batch: &mut Batch, hash: &str, budget: usize) -> io::Result<Source> {
    let scope = crate::scope_path(&batch.root);
    let source = scope
        .join("objects")
        .join(&hash[..2])
        .join(&hash[2..]);
    let proof = required(&mut batch.proofs, &source)?;
    let bytes = crate::checkout::repository::source(
        &scope.join("objects"),
        crate::merge_history::hash(hash)?,
        budget,
        &mut 0,
    )?;
    Ok(Source { path: source, proof, bytes })
}
