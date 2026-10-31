//! Lane identity and object reads share the command import capture. None of
//! these operations publishes an object or changes the workspace's active lane.
pub(in crate::command_import) mod merge;
pub(crate) use tracking::SwitchTracking;

use super::{PreparedImport, invalid};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::io;
mod artifacts;
mod tracking;

#[cfg(test)]
mod tests;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct Id {
    pub(crate) scope: String,
    pub(crate) name: String,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct Record {
    pub(crate) hash: String,
    pub(crate) value: Value,
    pub(crate) is_new: bool,
}
#[derive(Clone)]
pub(crate) struct Entry {
    pub(crate) identity: String,
    pub(crate) head: String,
    pub(crate) hidden: bool,
}
impl Id {
    pub(crate) fn validate(&self) -> io::Result<()> {
        for part in [&self.scope, &self.name] {
            if part.is_empty()
                || part.len() > 1024
                || matches!(part.as_str(), "." | "..")
                || !part
                    .bytes()
                    .all(|byte| byte.is_ascii_alphanumeric() || b"._-".contains(&byte))
            {
                return Err(invalid("command lane identity"));
            }
        }
        Ok(())
    }
    pub(crate) fn is_main(&self) -> bool {
        self.name == "main"
    }
}

impl PreparedImport {
    pub(crate) fn switch_existing_versions(&mut self) {
        self.cache.switch_existing_versions = true;
    }
    /// Publish the remote lane's refs without adding its Lane object to the
    /// local index. Public workspace fetch keeps only these refs.
    pub(crate) fn retain_remote_lane_refs(&mut self, record: &Record) -> io::Result<()> {
        merge::remote_refs(self, record)
    }

    /// Lane import retains the fetched Lane in the local index as well as its refs.
    pub(crate) fn publish_imported_lane(&mut self, id: &Id, incoming: &Record) -> io::Result<()> {
        let old = self.load_lane(id)?;
        merge::merge(self, old.as_ref(), incoming)?;
        Ok(())
    }

    pub(crate) fn fetched_lane(&self) -> Option<&Record> {
        self.cache.fetched_lane.as_ref()
    }
    pub(crate) fn lane_import_histories(&self) -> &[Value] {
        &self.writes.lane_histories
    }
    pub(crate) fn complete_lane_histories(
        &mut self,
        histories: Vec<(String, Value)>,
    ) -> io::Result<()> {
        if histories.len() != self.writes.lane_histories.len() {
            return Err(invalid("import LaneHistory receipt count"));
        }
        let mut objects = Vec::new();
        for ((hash, value), plan) in histories.into_iter().zip(&self.writes.lane_histories) {
            if plan["hash"] != hash
                || value["laneHash"] != plan["lane"]["hash"]
                || value["name"] != plan["lane"]["value"]["name"]
                || value["scope"] != plan["lane"]["value"]["scope"]
                || !value["history"].is_object()
            {
                return Err(invalid("import LaneHistory receipt identity"));
            }
            objects.push((hash.clone(), super::publish::object(&hash, "LaneHistory", value)?));
        }
        self.overlay.objects.extend(objects);
        self.writes.lane_histories.clear();
        Ok(())
    }
    pub(crate) fn resolve_other_lane(
        &mut self,
        id: &Id,
        skip_fetch: bool,
    ) -> io::Result<Option<Record>> {
        self.resolve_other_lane_with_policy(id, skip_fetch, false)
    }
    pub(super) fn resolve_other_lane_with_policy(
        &mut self,
        id: &Id,
        skip_fetch: bool,
        fetch_new: bool,
    ) -> io::Result<Option<Record>> {
        if id.is_main() {
            return Ok(None);
        }
        let mut old = self.load_lane(id)?;
        if old
            .as_ref()
            .is_some_and(|record| skip_fetch || record.is_new && !fetch_new)
        {
            return Ok(old);
        }
        let incoming = self.fetch_lane_components_at_hash(id, None)?;
        self.cache.fetched_lane = Some(incoming.clone());
        if old.is_none() {
            let previous_id = index_rows(&self.writes.index)?
                .iter()
                .find(|row| row["hash"] == incoming.hash)
                .map(|row| {
                    serde_json::from_value::<Id>(row["id"].clone()).map_err(io::Error::other)
                })
                .transpose()?;
            if let Some(previous_id) = previous_id {
                old = self.load_lane(&previous_id)?;
            }
        }
        let merged = merge::merge(self, old.as_ref(), &incoming)?;
        Ok(Some(merged))
    }
    pub(crate) fn lane_gap_source(
        &mut self,
        current: &Id,
        other: &Id,
        lane: Option<&Record>,
        should_squash: bool,
    ) -> io::Result<()> {
        let label = |id: &Id| {
            if id.is_main() { "main".to_owned() } else { format!("{}/{}", id.scope, id.name) }
        };
        self.cache.lane_reason = Some(
            if !should_squash
                && lane.is_some()
                && (current.is_main() || other.scope != current.scope)
            {
                format!(
                    "for filling the gap between the common-snap and the head of {}",
                    label(other),
                )
            } else {
                format!(
                    "for getting the common-snap between {} and {}",
                    label(current),
                    label(other),
                )
            },
        );
        if let Some(lane) = lane.filter(|lane| !lane.is_new) {
            for entry in entries(&lane.value)? {
                self.cache.lane_sources.insert(entry.identity, other.scope.clone());
            }
        }
        Ok(())
    }
    pub(crate) fn lane_model(&mut self, identity: &str) -> io::Result<Option<Value>> {
        let (scope, name) =
            identity.split_once('/').ok_or_else(|| invalid("command lane component scope"))?;
        component_identity(&serde_json::json!({"scope":scope,"name":name}))?;
        let hash = super::object_hash(identity);
        if let Some(value) = self.overlay.read(&hash, "Component")? {
            return Ok(Some(value.clone()));
        }
        self.capture
            .object(&self.environment.local_directory, &hash, "Component")?
            .map(|object| object.value.ok_or_else(|| invalid("command lane model body")))
            .transpose()
    }
    pub(crate) fn lane_version(&mut self, reference: &str) -> io::Result<Value> {
        if let Some(value) = self.overlay.read(reference, "Version")? {
            return Ok(value.clone());
        }
        self.capture
            .object(&self.environment.local_directory, reference, "Version")?
            .and_then(|object| object.value)
            .ok_or_else(|| invalid("command lane Version missing"))
    }
    pub(crate) fn lane_scope(&mut self) -> io::Result<Value> {
        let path = self.environment.local_directory
            .parent()
            .ok_or_else(|| invalid("command lane scope directory"))?
            .join("scope.json");
        self.capture.json(&path)?.ok_or_else(|| invalid("command lane scope missing"))
    }
    pub(crate) fn resolve_lane(&mut self, name: &str) -> io::Result<Id> {
        let scope = self.lane_scope()?;
        resolved(name, &scope, &self.writes.index)
    }
    pub(crate) fn load_lane(&mut self, id: &Id) -> io::Result<Option<Record>> {
        id.validate()?;
        if id.is_main() {
            return Ok(None);
        }
        let rows = index_rows(&self.writes.index)?;
        let hashes = rows
            .iter()
            .filter(|row| row["id"]["scope"] == id.scope && row["id"]["name"] == id.name)
            .map(|row| text(row, "hash").map(str::to_owned))
            .collect::<io::Result<Vec<_>>>()?;
        if hashes.len() > 1 {
            return Err(invalid("command duplicate lane index"));
        }
        let Some(hash) = hashes.into_iter().next() else { return Ok(None) };
        let value = if let Some(value) = self.overlay.read(&hash, "Lane")? {
            value.clone()
        } else {
            self.capture
                .object(&self.environment.local_directory, &hash, "Lane")?
                .and_then(|record| record.value)
                .ok_or_else(|| invalid("command indexed Lane missing"))?
        };
        validate_value(id, &value)?;
        let scope = self.lane_scope()?;
        let is_new = scope["lanes"]["new"]
            .as_array()
            .is_some_and(|rows| rows.iter().any(|name| name == &id.name));
        Ok(Some(Record { hash, value, is_new }))
    }
}

/// Resolve a local lane spelling without fetching; the authoritative importer repeats this capture.
pub fn resolve_lane_identity(root: &std::path::Path, name: &str) -> io::Result<String> {
    if !root.is_absolute() {
        return Err(invalid("command lane root path"));
    }
    let mut capture = super::Capture::default();
    let directory = crate::scope_path(root);
    let scope = capture
        .json(&directory.join("scope.json"))?
        .ok_or_else(|| invalid("command lane scope missing"))?;
    let index = capture
        .json(&directory.join("index.json"))?
        .unwrap_or_else(|| serde_json::json!({"lanes":[]}));
    let id = resolved(name, &scope, &index)?;
    capture.validate()?;
    Ok(format!("{}/{}", id.scope, id.name))
}
fn resolved(name: &str, scope: &Value, index: &Value) -> io::Result<Id> {
    let id = if let Some((scope, name)) = name.split_once('/') {
        Id { scope: scope.into(), name: name.into() }
    } else if name == "main" {
        Id { scope: text(scope, "name")?.into(), name: name.into() }
    } else {
        resolve_local(name, scope, index)?
    };
    id.validate()?;
    Ok(id)
}

fn resolve_local(name: &str, scope: &Value, index: &Value) -> io::Result<Id> {
    if let Some(rows) = scope["lanes"]["tracking"].as_array() {
        if rows.len() > 4096 {
            return Err(invalid("command lane tracking budget"));
        }
        if let Some(row) = rows
            .iter()
            .find(|row| row["localLane"] == name)
        {
            return Ok(Id {
                scope: text(row, "remoteScope")?.into(),
                name: text(row, "remoteLane")?.into(),
            });
        }
    }
    let candidates = index_rows(index)?
        .iter()
        .filter(|row| row["id"]["name"] == name)
        .collect::<Vec<_>>();
    if candidates.len() != 1 {
        return Err(invalid("command lane alias missing or ambiguous"));
    }
    Ok(Id { scope: text(&candidates[0]["id"], "scope")?.into(), name: name.into() })
}
fn index_rows(index: &Value) -> io::Result<&[Value]> {
    if index.is_array() {
        return Ok(&[][..]);
    }
    let rows = index["lanes"].as_array().ok_or_else(|| invalid("command lane index"))?;
    if rows.len() > 4096 {
        return Err(invalid("command lane index budget"));
    }
    Ok(rows)
}
pub(crate) fn entries(value: &Value) -> io::Result<Vec<Entry>> {
    let visible =
        value["components"].as_array().ok_or_else(|| invalid("command lane components"))?;
    let mut result = visible
        .iter()
        .map(|row| {
            let identity = component_identity(&row["id"])?;
            let head = text(row, "head")?.to_owned();
            crate::merge_history::hash(&head)?;
            Ok(Entry { identity, head, hidden: false })
        })
        .collect::<io::Result<Vec<_>>>()?;
    let mut identities = std::collections::HashSet::new();
    if result
        .iter()
        .any(|entry| !identities.insert(entry.identity.clone()))
    {
        return Err(invalid("command duplicate visible lane component"));
    }
    if let Some(hidden) = value.get("updateDependents") {
        for row in hidden.as_array().ok_or_else(|| invalid("command hidden lane components"))? {
            let entry = hidden_entry(row)?;
            let identity = entry.identity;
            let head = entry.head;
            if result
                .iter()
                .any(|entry| entry.identity == identity)
            {
                return Err(invalid("command duplicate visible or hidden lane component"));
            }
            result.push(Entry { identity, head, hidden: true });
        }
    }
    if result.len() > 4096 {
        return Err(invalid("command lane component budget"));
    }
    Ok(result)
}
fn hidden_entry(row: &Value) -> io::Result<Entry> {
    let (identity, head) = row
        .as_str()
        .and_then(|value| value.rsplit_once('@'))
        .ok_or_else(|| invalid("command hidden lane identity"))?;
    let (scope, name) =
        identity.split_once('/').ok_or_else(|| invalid("command hidden lane scope"))?;
    let identity = component_identity(&serde_json::json!({"scope":scope,"name":name}))?;
    let head = head.to_owned();
    crate::merge_history::hash(&head)?;
    Ok(Entry { identity, head, hidden: true })
}
pub(crate) fn component_identity(value: &Value) -> io::Result<String> {
    let scope = text(value, "scope")?;
    let name = text(value, "name")?;
    if scope.is_empty()
        || scope.len() > 1024
        || matches!(scope, "." | "..")
        || !scope
            .bytes()
            .all(|byte| {
                byte.is_ascii_lowercase() || byte.is_ascii_digit() || b"._-".contains(&byte)
            })
    {
        return Err(invalid("command lane component scope"));
    }
    if name.is_empty()
        || name.len() > 4096
        || name
            .split('/')
            .any(|part| {
                part.is_empty()
                    || matches!(part, "." | "..")
                    || !part
                        .bytes()
                        .all(|byte| {
                            byte.is_ascii_lowercase()
                                || byte.is_ascii_digit()
                                || b"_-".contains(&byte)
                        })
            })
    {
        return Err(invalid("command lane component identity"));
    }
    Ok(format!("{scope}/{name}"))
}
pub(crate) fn validate_value(id: &Id, value: &Value) -> io::Result<()> {
    if value["scope"] != id.scope || value["name"] != id.name {
        return Err(invalid("command lane object identity"));
    }
    entries(value)?;
    Ok(())
}
fn text<'a>(value: &'a Value, key: &str) -> io::Result<&'a str> {
    value[key].as_str().ok_or_else(|| invalid("command lane string field"))
}
