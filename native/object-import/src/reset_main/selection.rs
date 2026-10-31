//! Select local main history and preserve Bit's tag names in the report.

use super::{invalid, outbound};
use serde_json::{Map, Value};
use std::{
    collections::{HashMap, HashSet},
    io,
    path::Path,
};

/// The local refs to remove, their user-facing labels, and the surviving head.
pub struct Selection {
    pub removed: Vec<String>,
    pub labels: Vec<String>,
    pub next_head: Option<String>,
}

/// `ModelComponent.getLocalHashes` for a linear main history. A distinct
/// recorded detached head stays separate from the main parent chain.
pub fn select(component: &Value, objects: &Path, head_only: bool) -> io::Result<Selection> {
    let local = local_refs(component)?;
    let head = component["head"].as_str().ok_or_else(|| invalid("reset head absent"))?;
    if !local.contains_key(head) {
        return Err(invalid("reset head is exported"));
    }
    let (removed, next_head) = walk(objects, head, &local, head_only)?;
    if !head_only {
        validate_other_local(component, &local, &removed)?;
    }
    let labels = labels(component, &removed)?;
    Ok(Selection { removed, labels, next_head })
}

fn local_refs(component: &Value) -> io::Result<HashMap<String, String>> {
    let versions =
        component["versions"].as_object().ok_or_else(|| invalid("reset versions map"))?;
    let orphaned = component["orphanedVersions"].as_object();
    let state = component["state"]["versions"]
        .as_object()
        .ok_or_else(|| invalid("reset local versions map"))?;
    let mut local = HashMap::new();
    for (label, row) in state {
        if row["local"] != true {
            continue;
        }
        let hash = versions
            .get(label)
            .or_else(|| orphaned.and_then(|map| map.get(label)))
            .and_then(Value::as_str)
            .unwrap_or(label);
        crate::merge_history::hash(hash)?;
        if local.insert(hash.to_owned(), label.to_owned()).is_some() {
            return Err(invalid("reset duplicate local hash"));
        }
    }
    Ok(local)
}

fn walk(
    objects: &Path,
    head: &str,
    local: &HashMap<String, String>,
    head_only: bool,
) -> io::Result<(Vec<String>, Option<String>)> {
    let mut current = head.to_owned();
    let mut removed = Vec::new();
    let mut seen = HashSet::new();
    loop {
        if !seen.insert(current.clone()) || seen.len() > 4096 {
            return Err(invalid("reset cyclic or oversized local history"));
        }
        removed.push(current.clone());
        let next = parent(objects, &current)?;
        if head_only
            || next
                .as_ref()
                .is_none_or(|next| !local.contains_key(next))
        {
            return Ok((removed, next));
        }
        current = next.ok_or_else(|| invalid("reset parent absent"))?;
    }
}

fn parent(objects: &Path, reference: &str) -> io::Result<Option<String>> {
    let version = outbound::read_object(objects, reference, "Version")?;
    let parents = version["parents"].as_array().ok_or_else(|| invalid("reset Version parents"))?;
    match parents.as_slice() {
        [] => Ok(None),
        [parent] => {
            let parent = parent.as_str().ok_or_else(|| invalid("reset parent ref"))?;
            crate::merge_history::hash(parent)?;
            Ok(Some(parent.to_owned()))
        }
        _ => Err(invalid("reset merge-parent Version")),
    }
}

fn validate_other_local(
    component: &Value,
    local: &HashMap<String, String>,
    removed: &[String],
) -> io::Result<()> {
    let detached: HashSet<_> = component["detachedHeads"]["heads"]
        .as_array()
        .map_or(&[][..], Vec::as_slice)
        .iter()
        .filter_map(Value::as_str)
        .collect();
    let selected: HashSet<_> = removed
        .iter()
        .map(String::as_str)
        .collect();
    if local
        .keys()
        .any(|hash| !selected.contains(hash.as_str()) && !detached.contains(hash.as_str()))
    {
        return Err(invalid("reset non-linear local history"));
    }
    Ok(())
}

fn labels(component: &Value, removed: &[String]) -> io::Result<Vec<String>> {
    let versions =
        component["versions"].as_object().ok_or_else(|| invalid("reset versions map"))?;
    let orphaned = component["orphanedVersions"].as_object();
    let state = component["state"]["versions"]
        .as_object()
        .ok_or_else(|| invalid("reset local versions map"))?;
    let selected: HashSet<_> = removed
        .iter()
        .map(String::as_str)
        .collect();
    Ok(state
        .iter()
        .filter_map(|(label, row)| {
            let hash = versions
                .get(label)
                .or_else(|| orphaned.and_then(|map| map.get(label)))
                .and_then(Value::as_str)
                .unwrap_or(label);
            (row["local"] == true && selected.contains(hash)).then_some(label.clone())
        })
        .collect())
}

impl Selection {
    pub(super) fn bitmap_version(&self, component: &Value) -> String {
        let Some(head) = self.next_head.as_deref() else { return String::new() };
        component["versions"]
            .as_object()
            .into_iter()
            .chain(component["orphanedVersions"].as_object())
            .flat_map(|versions| versions.iter())
            .find_map(|(label, value)| (value.as_str() == Some(head)).then_some(label.clone()))
            .unwrap_or_else(|| head.to_owned())
    }

    /// `removeVersion` drops selected tag and state keys, then the surviving
    /// parent becomes `head`. Empty Components have no scope-index entry.
    pub fn updated_model(&self, original: &Value) -> io::Result<Option<Value>> {
        let mut component = original.clone();
        remove_labels(component["versions"].as_object_mut(), &self.labels)?;
        remove_labels(component["state"]["versions"].as_object_mut(), &self.labels)?;
        let fields = component.as_object_mut().ok_or_else(|| invalid("reset Component object"))?;
        if let Some(head) = &self.next_head {
            fields.insert("head".into(), Value::String(head.clone()));
        } else {
            fields.shift_remove("head");
        }
        let empty = component["versions"].as_object().is_some_and(Map::is_empty);
        Ok((!empty || self.next_head.is_some()).then_some(component))
    }
}

fn remove_labels(fields: Option<&mut Map<String, Value>>, labels: &[String]) -> io::Result<()> {
    let fields = fields.ok_or_else(|| invalid("reset versions map"))?;
    for label in labels {
        fields.shift_remove(label);
    }
    Ok(())
}
