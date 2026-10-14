//! Select staged, already-scoped main-lane components and freeze their
//! compressed object closure before any remote side effect.
use super::{Prepare, invalid};
use crate::transfer::{self, Body, collection};
use bit_client_transfer::tar::ObjectItem;
use flate2::{Compression, write::ZlibEncoder};
use serde_json::{Value, json};
use sha1::{Digest, Sha1};
use std::{
    fs,
    io::{self, Write},
    path::Path,
};

const MAX_BYTES: usize = 32 * 1024 * 1024;

pub(super) struct Selected {
    pub(super) scope: String,
    pub(super) name: String,
    pub(super) model_hash: String,
    pub(super) model_before: Vec<u8>,
    pub(super) model_after: Vec<u8>,
    pub(super) history_hash: String,
    pub(super) history: Vec<u8>,
    pub(super) head: String,
    pub(super) version: String,
    pub(super) objects: Vec<ObjectItem>,
}

pub(super) fn select(input: &Prepare) -> io::Result<Vec<Selected>> {
    let root = &input.root;
    let scope: Value = serde_json::from_slice(&fs::read(root.join(".bit/scope.json"))?)?;
    if scope["lanes"]["current"] != "main" {
        return Err(invalid("outbound lane export"));
    }
    let index: Value = serde_json::from_slice(&fs::read(root.join(".bit/index.json"))?)?;
    if !index["lanes"].as_array().is_some_and(Vec::is_empty) {
        return Err(invalid("outbound lane index"));
    }
    let rows = index["components"].as_array().ok_or_else(|| invalid("outbound index"))?;
    let staged = staged_rows(root, rows)?;
    let selected = requested(input, staged)?;
    let mut components = Vec::new();
    let mut selected_scope = None;
    for (row, model) in selected {
        let component = select_one(input, &row, model)?;
        if selected_scope
            .as_ref()
            .is_some_and(|scope| scope != &component.scope)
        {
            return Err(invalid("outbound multiple remote scopes"));
        }
        selected_scope = Some(component.scope.clone());
        components.push(component);
    }
    Ok(components)
}

fn staged_rows(root: &Path, rows: &[Value]) -> io::Result<Vec<(Value, Value)>> {
    let mut staged = Vec::new();
    for row in rows {
        let model = load_model(root, row)?;
        if has_staged(&model) {
            staged.push((row.clone(), model));
        }
    }
    Ok(staged)
}

fn requested(input: &Prepare, staged: Vec<(Value, Value)>) -> io::Result<Vec<(Value, Value)>> {
    if input.ids.is_empty() {
        return Ok(staged);
    }
    let mut chosen = Vec::new();
    for id in &input.ids {
        let (scope, named) = id.split_once('/').ok_or_else(|| invalid("outbound unscoped id"))?;
        let (name, version) = named
            .rsplit_once('@')
            .map_or((named, None), |(name, version)| (name, Some(version)));
        let component = staged
            .iter()
            .find(|(row, model)| {
                row["id"]["scope"] == scope
                    && row["id"]["name"] == name
                    && version.is_none_or(|version| {
                        model["versions"][version].as_str() == model["head"].as_str()
                    })
            });
        let Some(component) = component else {
            return Err(invalid("outbound requested component is not staged"));
        };
        if chosen
            .iter()
            .any(|(row, _): &(Value, Value)| row["hash"] == component.0["hash"])
        {
            return Err(invalid("outbound duplicate component"));
        }
        chosen.push(component.clone());
    }
    Ok(chosen)
}

fn select_one(input: &Prepare, row: &Value, mut model: Value) -> io::Result<Selected> {
    let root = &input.root;
    let scope = row["id"]["scope"]
        .as_str()
        .ok_or_else(|| invalid("outbound scope"))?
        .to_owned();
    let name = row["id"]["name"]
        .as_str()
        .ok_or_else(|| invalid("outbound name"))?
        .to_owned();
    if model["scope"] != scope || model["name"] != name {
        return Err(invalid("outbound model identity"));
    }
    let model_hash = row["hash"]
        .as_str()
        .ok_or_else(|| invalid("outbound model hash"))?
        .to_owned();
    let (version_name, head) = staged_head(&model)?;
    let objects_dir = root.join(".bit/objects");
    let model_before = transfer::object::repository(
        &objects_dir,
        crate::merge_history::hash(&model_hash)?,
        MAX_BYTES,
    )?;
    let history_hash = crate::validate::hexadecimal(&Sha1::digest(
        format!("{scope}/{name}:VersionHistory").as_bytes(),
    ));
    let history = history(&objects_dir, &scope, &name, &head, &history_hash)?;
    let host = super::remote::configured_host(input, &scope)?;
    clear_and_mark_exported(&mut model, &scope, &host, &input.transport.export_date)?;
    let model_after = encode(&model_hash, "Component", &model)?;
    let objects = collect(&objects_dir, &model_hash, &model_after, &history_hash, &history, &head)?;
    Ok(Selected {
        scope,
        name,
        model_hash,
        model_before,
        model_after,
        history_hash,
        history,
        head,
        version: version_name,
        objects,
    })
}

fn load_model(root: &Path, row: &Value) -> io::Result<Value> {
    let hash = row["hash"].as_str().ok_or_else(|| invalid("outbound index hash"))?;
    read_object(&root.join(".bit/objects"), hash, "Component")
}
fn read_object(dir: &Path, hash: &str, kind: &str) -> io::Result<Value> {
    let parsed = crate::merge_history::hash(hash)?;
    let compressed = transfer::object::repository(dir, parsed, MAX_BYTES)?;
    let raw = crate::checkout::repository::inflate(&compressed, MAX_BYTES)?;
    let (_, body) = crate::checkout::repository::split(&raw, parsed, kind)?;
    serde_json::from_slice(body).map_err(io::Error::other)
}
fn has_staged(model: &Value) -> bool {
    model["state"]["versions"]
        .as_object()
        .is_some_and(|rows| {
            rows.values()
                .any(|row| row["local"] == true)
        })
}
fn staged_head(model: &Value) -> io::Result<(String, String)> {
    let rows =
        model["state"]["versions"].as_object().ok_or_else(|| invalid("outbound local versions"))?;
    let local = rows
        .iter()
        .filter(|(_, row)| row["local"] == true)
        .collect::<Vec<_>>();
    if local.len() != 1 {
        return Err(invalid("outbound multiple local versions"));
    }
    let hash = model["versions"][local[0].0]
        .as_str()
        .ok_or_else(|| invalid("outbound local Version ref"))?;
    if model["head"] != hash {
        return Err(invalid("outbound non-head local Version"));
    }
    crate::merge_history::hash(hash)?;
    Ok((local[0].0.to_owned(), hash.to_owned()))
}

fn history(
    dir: &Path,
    scope: &str,
    name: &str,
    head: &str,
    history_hash: &str,
) -> io::Result<Vec<u8>> {
    let version = read_object(dir, head, "Version")?;
    if version["unrelated"] == true || version["squashed"] == true {
        return Err(invalid("outbound rewritten history requires canonical export"));
    }
    let parents =
        version["parents"].as_array().ok_or_else(|| invalid("outbound Version parents"))?;
    for parent in parents {
        crate::merge_history::hash(
            parent.as_str().ok_or_else(|| invalid("outbound Version parent"))?,
        )?;
    }
    let path = dir
        .join(&history_hash[..2])
        .join(&history_hash[2..]);
    let mut value = if path.try_exists()? {
        read_object(dir, history_hash, "VersionHistory")?
    } else {
        json!({"name":name,"scope":scope,"versions":[],"graphCompleteRefs":[]})
    };
    if value["name"] != name || value["scope"] != scope {
        return Err(invalid("outbound VersionHistory identity"));
    }
    let rows =
        value["versions"].as_array_mut().ok_or_else(|| invalid("outbound VersionHistory rows"))?;
    if !rows
        .iter()
        .any(|row| row["hash"] == head)
    {
        rows.push(json!({"hash":head,"parents":parents}));
    }
    encode(history_hash, "VersionHistory", &value)
}
fn clear_and_mark_exported(
    model: &mut Value,
    scope: &str,
    host: &str,
    date: &str,
) -> io::Result<()> {
    let rows = model.as_object_mut().ok_or_else(|| invalid("outbound model"))?;
    rows.shift_remove("state");
    rows.shift_remove("local");
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
fn encode(hash: &str, kind: &str, value: &Value) -> io::Result<Vec<u8>> {
    crate::merge_history::hash(hash)?;
    let body = serde_json::to_string(value).map_err(io::Error::other)?;
    let mut encoder = ZlibEncoder::new(Vec::new(), Compression::default());
    write!(encoder, "{kind} {hash} {}\0{body}", body.encode_utf16().count())?;
    encoder.finish()
}
fn collect(
    dir: &Path,
    model_hash: &str,
    model: &[u8],
    history_hash: &str,
    history: &[u8],
    head: &str,
) -> io::Result<Vec<ObjectItem>> {
    let versions = [collection::Version {
        hash: crate::merge_history::hash(head)?,
        locally_changed: true,
        expected: None,
    }];
    let descriptors = collection::select(
        dir,
        &versions,
        None,
        0,
        &collection::Mode::Export { strict_local_artifacts: true },
    )?;
    let mut objects =
        vec![ObjectItem { hash: model_hash.to_owned(), compressed: model.to_vec(), scope: None }];
    let mut budget = model.len() + history.len();
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
    objects.push(ObjectItem {
        hash: history_hash.to_owned(),
        compressed: history.to_vec(),
        scope: None,
    });
    Ok(objects)
}
