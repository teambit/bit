use super::{Component, Plan, Retained, graph, invalid};
use crate::workspace::{
    engine::{
        command::{capture, repository, resolve},
        dependency_graph::proof,
        status_models::{comparison, versions},
    },
    snapshots,
};
use serde_json::{Value, json};
use std::{collections::HashSet, fs, io};

pub(super) fn plan(
    retained: &mut Retained,
    input: Plan,
    snapshots: &mut snapshots::State,
    pool: &rayon::ThreadPool,
) -> io::Result<Value> {
    retained.check(&input.token)?;
    if retained.prepared.is_some() || retained.graph.staged {
        return Err(invalid("stash already finalized"));
    }
    validate(retained, &input)?;
    let captured =
        capture::all_for_snapshot(&retained.root, input.current.clone(), snapshots, pool)?;
    let mut components = select(retained, &captured, &input)?;
    components.sort_by_key(|component| component.new);
    retained.graph.error =
        graph::project(&mut components, &mut retained.repository, &retained.context)?;
    retained.proofs.extend(resolve::source_proofs::capture(&captured, snapshots)?);
    retained.proofs.extend(input.dependency_read_set);
    proof::verify(&retained.proofs)?;
    retained.components = components;
    Ok(response(retained))
}

fn select(
    retained: &mut Retained,
    captured: &[capture::Captured],
    input: &Plan,
) -> io::Result<Vec<Component>> {
    let mut components = Vec::new();
    let bitmap = crate::parse_jsonc(&fs::read(retained.root.join(".bitmap"))?)?;
    for current in captured {
        if input.selected_ids
            .as_ref()
            .is_some_and(|ids| !ids.contains(&current.target.identity))
        {
            continue;
        }
        let Some((stored, previous)) = eligible(retained, current, input.include_new)? else {
            continue;
        };
        let mut component = component(current, &stored, previous, &input.components, &bitmap)?;
        if let Some(metadata) = input.consumer_metadata.get(&component.identity) {
            apply_metadata(&mut component.version, metadata)?;
        }
        if component.previous.is_some() {
            component.version["log"] = stored["log"].clone();
        }
        components.push(component);
    }
    Ok(components)
}

fn eligible(
    retained: &mut Retained,
    current: &capture::Captured,
    include_new: bool,
) -> io::Result<Option<(Value, Option<String>)>> {
    let model = repository::model(&retained.context, &current.target.identity)?;
    let previous = if current.target.version.is_empty() {
        None
    } else {
        Some(versions::reference(
            &model.ok_or_else(|| invalid("stash missing model"))?,
            &current.target.version,
        )?)
    };
    let stored = match &previous {
        Some(hash) => retained.repository.read(hash, "Version")?,
        None => json!({"schema":"2.0.0","extensions":[]}),
    };
    if previous.is_none() && !include_new {
        return Ok(None);
    }
    if previous.is_some()
        && comparison::compare(&current.target, &current.metadata, &stored)?["modified"] != true
    {
        return Ok(None);
    }
    Ok(Some((stored, previous)))
}

fn validate(retained: &Retained, input: &Plan) -> io::Result<()> {
    let targets = retained.context["targets"].as_array().ok_or_else(|| invalid("stash targets"))?;
    if input.current.len() != targets.len() || input.components.len() != targets.len() {
        return Err(invalid("stash capture count"));
    }
    for (current, target) in input.current.iter().zip(targets) {
        for key in ["identity", "version", "directory"] {
            if current[key] != target[key] {
                return Err(invalid("stash capture binding"));
            }
        }
    }
    validate_selection(targets, input.selected_ids.as_deref())?;
    Ok(())
}

fn validate_selection(targets: &[Value], ids: Option<&[String]>) -> io::Result<()> {
    if let Some(ids) = ids {
        let mut seen = HashSet::new();
        for id in ids {
            if !seen.insert(id)
                || !targets
                    .iter()
                    .any(|target| target["identity"] == *id)
            {
                return Err(invalid("stash selection"));
            }
        }
    }
    Ok(())
}

fn component(
    current: &capture::Captured,
    stored: &Value,
    previous: Option<String>,
    receipts: &[resolve::projection::Component],
    bitmap: &Value,
) -> io::Result<Component> {
    let identity = &current.target.identity;
    let receipt = receipts
        .iter()
        .find(|row| row.identity == *identity)
        .ok_or_else(|| invalid("stash component policy absent"))?;
    let mut version =
        super::projection::version(stored, &current.target.current, &current.metadata, receipt)?;
    for key in ["log", "docs", "buildStatus", "packageJsonChangedProps"] {
        if let Some(value) = current.target.current.get(key) {
            version[key] = value.clone();
        }
    }
    let entry = find_entry(bitmap, identity, &current.target.directory)?;
    let (scope, name) = identity.split_once('/').ok_or_else(|| invalid("stash identity"))?;
    Ok(Component {
        identity: identity.clone(),
        id: graph::component_id(
            scope,
            name,
            &current.target.version,
            entry["scope"]
                .as_str()
                .is_some_and(|value| !value.is_empty()),
        ),
        version,
        files: current.files
            .as_array()
            .ok_or_else(|| invalid("stash captured files"))?
            .clone(),
        new: previous.is_none(),
        previous,
        bitmap_entry: bitmap_entry(&entry, scope),
    })
}

fn find_entry(bitmap: &Value, identity: &str, directory: &str) -> io::Result<Value> {
    bitmap
        .as_object()
        .ok_or_else(|| invalid("stash bitmap object"))?
        .iter()
        .find(|(key, entry)| {
            if key.starts_with('$')
                || matches!(key.as_str(), "_bit_lane" | "version")
                || !entry.is_object()
            {
                return false;
            }
            let scope = entry["scope"].as_str().unwrap_or_default();
            let (_, name) = crate::reset_lane::bitmap::row_identity(key, entry);
            entry["rootDir"] == directory
                && (format!("{scope}/{name}") == identity
                    || (scope.is_empty() && identity.ends_with(&format!("/{name}"))))
        })
        .map(|(_, entry)| entry.clone())
        .ok_or_else(|| invalid("stash bitmap entry"))
}

fn response(retained: &Retained) -> Value {
    let ids = |new| {
        retained.components
            .iter()
            .filter(|row| row.new == new)
            .map(|row| row.identity.clone())
            .collect::<Vec<_>>()
    };
    json!({"token":retained.token,"modifiedIds":ids(false),"newIds":ids(true),
        "needsStash":retained.components.iter().map(|row|row.identity.clone()).collect::<Vec<_>>(),
        "needsLog":retained.components.iter().filter(|row|row.version.get("log").is_none_or(Value::is_null)).map(|row|row.identity.clone()).collect::<Vec<_>>(),
        "graphImports":retained.repository.progress()["imports"]})
}

const BITMAP_FIELDS: &[&str] = &[
    "mainFile",
    "rootDir",
    "wrapDir",
    "exported",
    "onLanesOnly",
    "isAvailableOnCurrentLane",
    "nextVersion",
    "localOnly",
    "config",
];
fn bitmap_entry(entry: &Value, scope: &str) -> Value {
    let mut output = serde_json::Map::new();
    if let Some(value) = default_scope(entry, scope) {
        output.insert("defaultScope".into(), value);
    }
    for field in BITMAP_FIELDS {
        let value = bitmap_value(entry, field);
        if !value.is_null() {
            output.insert((*field).into(), value);
        }
    }
    Value::Object(output)
}
fn default_scope(entry: &Value, scope: &str) -> Option<Value> {
    entry
        .get("defaultScope")
        .cloned()
        .or_else(|| {
            entry["scope"]
                .as_str()
                .filter(|value| value.is_empty())
                .map(|_| json!(scope))
        })
}
fn bitmap_value(entry: &Value, field: &str) -> Value {
    let default = if field == "isAvailableOnCurrentLane" { json!(true) } else { Value::Null };
    let mut value = entry
        .get(field)
        .cloned()
        .unwrap_or(default);
    if matches!(field, "onLanesOnly" | "localOnly") && value == false {
        return Value::Null;
    }
    if field == "config" {
        clean_config(&mut value);
    }
    value
}
fn clean_config(value: &mut Value) {
    for config in value
        .as_object_mut()
        .into_iter()
        .flat_map(|map| map.values_mut())
    {
        if let Some(config) = config.as_object_mut() {
            config.remove("__specific");
        }
    }
}

fn apply_metadata(version: &mut Value, metadata: &Value) -> io::Result<()> {
    let metadata = metadata.as_object().ok_or_else(|| invalid("stash consumer metadata"))?;
    let version = version.as_object_mut().ok_or_else(|| invalid("stash consumer version"))?;
    for field in ["log", "docs", "buildStatus", "packageJsonChangedProps", "dependenciesGraph"] {
        if let Some(value) = metadata.get(field) {
            version.insert(field.into(), value.clone());
        } else {
            version.remove(field);
        }
    }
    Ok(())
}
