//! Reconcile hidden lane heads with the current remote before exporting.
use super::{Loaded, Prepare, Selection, invalid, model, read_compressed, remote};
use bit_client_transfer::{fetch::FetchOptions, http::Network, remotes::Remote, tar::ObjectItem};
use serde_json::{Value, json};
use sha1::{Digest, Sha1};
use std::{fs, io, path::Path};

pub(super) struct Reconciled {
    pub exported: Value,
    pub local: Value,
}

pub(super) fn append(
    input: &Prepare,
    loaded: &Loaded,
    scope: &str,
    name: &str,
    selected: &mut Selection,
) -> io::Result<(Value, Option<Vec<u8>>)> {
    let reconciled = prepare(input, loaded, scope, name, &selected.histories)?;
    for hash in [&loaded.history_hash, &loaded.hash] {
        let compressed = if hash == &loaded.hash && reconciled.exported != loaded.lane {
            model::encode(hash, "Lane", &reconciled.exported)?
        } else {
            read_compressed(&loaded.dir, hash)?
        };
        selected.append(ObjectItem { hash: hash.clone(), compressed, scope: None })?;
    }
    let after = (reconciled.local != loaded.lane)
        .then(|| model::encode(&loaded.hash, "Lane", &reconciled.local))
        .transpose()?;
    Ok((reconciled.local, after))
}

pub(super) fn prepare(
    input: &Prepare,
    loaded: &Loaded,
    scope: &str,
    name: &str,
    histories: &[model::HistoryBytes],
) -> io::Result<Reconciled> {
    let mut exported = loaded.lane.clone();
    let scope_file: Value =
        serde_json::from_slice(&fs::read(crate::scope_path(&input.root).join("scope.json"))?)?;
    let is_new = scope_file["lanes"]["new"]
        .as_array()
        .is_some_and(|rows| rows.iter().any(|row| row == name));
    let local = entries(&loaded.lane)?;
    if !input.resolution.preflight() && !is_new && !local.is_empty() {
        let host = remote::host(input, scope)?;
        if let Some(origin) = fetch(input, &host, scope, name)? {
            let remote = entries(&origin)?;
            let merged = merge(&loaded.lane, &local, &remote, histories, &loaded.dir)?;
            set_entries(&mut exported, &merged)?;
            set_override(&mut exported, sorted(&merged) != sorted(&remote))?;
        }
    }
    let mut local_lane = loaded.lane.clone();
    let exported_entries = entries(&exported)?;
    if sorted(&local) != sorted(&exported_entries) {
        set_entries(&mut local_lane, &exported_entries)?;
    }
    set_override(&mut local_lane, false)?;
    Ok(Reconciled { exported, local: local_lane })
}
fn entries(lane: &Value) -> io::Result<Vec<String>> {
    match lane.get("updateDependents") {
        None | Some(Value::Null) => Ok(Vec::new()),
        Some(Value::Array(rows)) => rows
            .iter()
            .map(|row| {
                row.as_str()
                    .map(str::to_owned)
                    .ok_or_else(|| invalid("outbound hidden identity"))
            })
            .collect(),
        _ => Err(invalid("outbound hidden entries")),
    }
}
fn identity(value: &str) -> io::Result<(&str, &str)> {
    let (id, hash) = value.rsplit_once('@').ok_or_else(|| invalid("outbound hidden version"))?;
    crate::merge_history::hash(hash)?;
    if !id.contains('/') {
        return Err(invalid("outbound hidden scope"));
    }
    Ok((id, hash))
}
fn visible(lane: &Value, id: &str) -> bool {
    lane["components"]
        .as_array()
        .is_some_and(|rows| {
            rows.iter()
                .any(|row| {
                    row["id"]["scope"]
                        .as_str()
                        .zip(row["id"]["name"].as_str())
                        .is_some_and(|(scope, name)| format!("{scope}/{name}") == id)
                })
        })
}
fn merge(
    lane: &Value,
    local: &[String],
    remote: &[String],
    histories: &[model::HistoryBytes],
    objects: &Path,
) -> io::Result<Vec<String>> {
    let mut result = Vec::new();
    for entry in remote {
        let (id, head) = identity(entry)?;
        if visible(lane, id) {
            continue;
        }
        result.push(select_head(entry, id, head, local, histories, objects)?);
    }
    if lane["overrideUpdateDependents"] == true {
        add_new(&mut result, local, remote)?;
    }
    Ok(result)
}
fn select_head(
    entry: &str,
    id: &str,
    head: &str,
    local: &[String],
    histories: &[model::HistoryBytes],
    objects: &Path,
) -> io::Result<String> {
    for candidate in local {
        let (candidate_id, candidate_head) = identity(candidate)?;
        if candidate_id == id
            && candidate_head != head
            && ahead(histories, objects, id, candidate_head, head)
        {
            return Ok(candidate.clone());
        }
    }
    Ok(entry.to_owned())
}
fn add_new(result: &mut Vec<String>, local: &[String], remote: &[String]) -> io::Result<()> {
    for candidate in local {
        let (id, _) = identity(candidate)?;
        if !remote
            .iter()
            .any(|row| identity(row).is_ok_and(|(remote_id, _)| remote_id == id))
        {
            result.push(candidate.clone());
        }
    }
    Ok(())
}
fn ahead(
    histories: &[model::HistoryBytes],
    objects: &Path,
    id: &str,
    local: &str,
    remote: &str,
) -> bool {
    let hash = crate::validate::hexadecimal(&Sha1::digest(format!("{id}:VersionHistory")));
    let history = histories
        .iter()
        .find(|history| history.hash == hash);
    let value = match history {
        Some(history) => decode_history(&history.bytes, &hash),
        None => model::read_object(objects, &hash, "VersionHistory"),
    };
    let Ok(value) = value else { return false };
    let Some(rows) = value["versions"].as_array() else { return false };
    reachable(rows, local, remote)
}
fn decode_history(bytes: &[u8], hash: &str) -> io::Result<Value> {
    let raw = crate::checkout::repository::inflate(bytes, super::MAX_BYTES)?;
    let (_, body) = crate::checkout::repository::split(
        &raw,
        crate::merge_history::hash(hash)?,
        "VersionHistory",
    )?;
    serde_json::from_slice(body).map_err(io::Error::other)
}
fn reachable(rows: &[Value], local: &str, remote: &str) -> bool {
    let mut pending = vec![local];
    let mut seen = std::collections::HashSet::new();
    while let Some(hash) = pending.pop() {
        if !seen.insert(hash) {
            continue;
        }
        let Some(row) = rows
            .iter()
            .find(|row| row["hash"] == hash)
        else {
            return false;
        };
        if hash == remote {
            return true;
        }
        let Some(parents) = row["parents"].as_array() else { return false };
        pending.extend(parents.iter().filter_map(Value::as_str));
    }
    false
}
fn sorted(rows: &[String]) -> Vec<String> {
    let mut rows = rows.to_vec();
    rows.sort_by(|left, right| left.encode_utf16().cmp(right.encode_utf16()));
    rows
}
fn set_entries(lane: &mut Value, entries: &[String]) -> io::Result<()> {
    let object = lane.as_object_mut().ok_or_else(|| invalid("outbound lane object"))?;
    if entries.is_empty() {
        object.remove("updateDependents");
    } else {
        object.insert("updateDependents".into(), json!(entries));
    }
    Ok(())
}
fn set_override(lane: &mut Value, enabled: bool) -> io::Result<()> {
    let object = lane.as_object_mut().ok_or_else(|| invalid("outbound lane object"))?;
    if enabled {
        object.insert("overrideUpdateDependents".into(), json!(true));
    } else {
        object.remove("overrideUpdateDependents");
    }
    Ok(())
}
fn fetch(input: &Prepare, host: &str, scope: &str, name: &str) -> io::Result<Option<Value>> {
    match Remote::from_host(host)? {
        Remote::File(path) => file(&path, scope, name),
        Remote::Http(url) => http(input, &url, scope, name),
    }
}
fn file(path: &Path, scope: &str, name: &str) -> io::Result<Option<Value>> {
    let index: Value = serde_json::from_slice(&fs::read(path.join("index.json"))?)?;
    let Some(rows) = index["lanes"].as_array() else {
        return if index.is_array() {
            Ok(None)
        } else {
            Err(invalid("outbound remote lane index"))
        };
    };
    let Some(row) = rows
        .iter()
        .find(|row| row["id"]["scope"] == scope && row["id"]["name"] == name)
    else {
        return Ok(None);
    };
    let hash = row["hash"].as_str().ok_or_else(|| invalid("outbound remote lane hash"))?;
    let lane = model::read_object(&path.join("objects"), hash, "Lane")?;
    validate_lane(lane, scope, name).map(Some)
}
fn http(input: &Prepare, url: &str, scope: &str, name: &str) -> io::Result<Option<Value>> {
    let config = super::super::hub::configuration(input)?;
    let local: Value =
        serde_json::from_slice(&fs::read(crate::scope_path(&input.root).join("scope.json"))?)?;
    let local_name = local["name"].as_str().ok_or_else(|| invalid("outbound local scope"))?;
    let network = Network::new(
        &config,
        &input.transport.bit_version,
        Some(local_name),
        input.transport.token.as_deref(),
    )?;
    fetch_http(&network, url, scope, name)
}
fn fetch_http(network: &Network, url: &str, scope: &str, name: &str) -> io::Result<Option<Value>> {
    let runtime = tokio::runtime::Builder::new_current_thread().enable_all().build()?;
    let items = runtime.block_on(network.fetch_bounded(
        url,
        &[format!("{scope}/{name}")],
        &FetchOptions::lanes(),
        super::MAX_BYTES,
    ));
    let items = match items {
        Ok(items) => items,
        Err(error)
            if error
                .get_ref()
                .is_some_and(
                    <dyn std::error::Error + Send + Sync + 'static>::is::<
                        bit_client_transfer::http::LaneNotFound,
                    >,
                ) =>
        {
            return Ok(None);
        }
        Err(error) => return Err(error),
    };
    let mut result = None;
    for item in items {
        let raw = crate::checkout::repository::inflate(&item.compressed, super::MAX_BYTES)?;
        if !raw.starts_with(b"Lane ") {
            continue;
        }
        let (_, body) = crate::checkout::repository::split(
            &raw,
            crate::merge_history::hash(&item.hash)?,
            "Lane",
        )?;
        let lane = validate_lane(serde_json::from_slice(body)?, scope, name)?;
        if result.replace(lane).is_some() {
            return Err(invalid("outbound duplicate remote lane"));
        }
    }
    Ok(result)
}
fn validate_lane(lane: Value, scope: &str, name: &str) -> io::Result<Value> {
    if lane["scope"] != scope || lane["name"] != name {
        return Err(invalid("outbound remote lane identity"));
    }
    entries(&lane)?
        .iter()
        .try_for_each(|value| identity(value).map(|_| ()))?;
    Ok(lane)
}

#[cfg(test)]
mod http_tests;
#[cfg(test)]
mod tests;
