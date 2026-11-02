//! Select local `main` history ([`select`], [`Selection`]) and preserve Bit's tag names in the reset report.

use super::{invalid, outbound};
use serde_json::{Map, Value};
use std::{
    collections::{HashMap, HashSet},
    io,
    path::Path,
};

/// Local `main` refs to remove, their user-facing tag/snap labels, and the surviving head.
#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct Selection {
    pub removed: Vec<String>,
    pub labels: Vec<String>,
    pub next_head: Option<String>,
}

/// `ModelComponent.getLocalHashes` for a linear main history. A distinct
/// recorded detached head stays separate from the main parent chain.
pub fn select(component: &Value, objects: &Path, head_only: bool) -> io::Result<Selection> {
    let local = local_refs(component)?;
    let raw_head = component["head"]
        .as_str()
        .map(str::trim)
        .filter(|head| !head.is_empty())
        .ok_or_else(|| invalid("reset head absent"))?;
    let head = crate::validate::hexadecimal(&crate::merge_history::hash(raw_head)?);
    if !local.contains_key(&head) {
        return Err(invalid("reset head is exported"));
    }
    let (removed, next_head) = walk(objects, &head, &local, head_only)?;
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
    let mut local = HashMap::with_capacity(state.len());
    for (label, row) in state {
        if row["local"] != true {
            continue;
        }
        let trimmed = label.trim();
        if trimmed.is_empty() {
            return Err(invalid("reset empty local version label"));
        }
        let raw_hash = resolve_label_hash(versions, orphaned, label, trimmed);
        let hash = crate::validate::hexadecimal(&crate::merge_history::hash(raw_hash)?);
        if local.insert(hash, trimmed.to_owned()).is_some() {
            return Err(invalid("reset duplicate local hash"));
        }
    }
    Ok(local)
}

fn resolve_label_hash<'a>(
    versions: &'a Map<String, Value>,
    orphaned: Option<&'a Map<String, Value>>,
    label: &'a str,
    trimmed: &'a str,
) -> &'a str {
    versions
        .get(label)
        .or_else(|| versions.get(trimmed))
        .or_else(|| {
            orphaned.and_then(|map| {
                map.get(label)
                    .or_else(|| map.get(trimmed))
            })
        })
        .and_then(Value::as_str)
        .unwrap_or(trimmed)
        .trim()
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
        let next = parent(objects, &current)?;
        removed.push(current);
        match next {
            Some(next) if !head_only && local.contains_key(&next) => current = next,
            next => return Ok((removed, next)),
        }
    }
}

fn parent(objects: &Path, reference: &str) -> io::Result<Option<String>> {
    let version = outbound::read_object(objects, reference, "Version")?;
    let parents = version["parents"].as_array().ok_or_else(|| invalid("reset Version parents"))?;
    match parents.as_slice() {
        [] => Ok(None),
        [parent] => {
            let parent = parent
                .as_str()
                .map(str::trim)
                .filter(|parent| !parent.is_empty())
                .ok_or_else(|| invalid("reset parent ref"))?;
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
        .map(str::trim)
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
            let trimmed = label.trim();
            let hash = resolve_label_hash(versions, orphaned, label, trimmed);
            (row["local"] == true && selected.contains(hash)).then(|| trimmed.to_owned())
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
            .find_map(|(label, value)| {
                (value.as_str().map(str::trim) == Some(head)).then(|| label.trim().to_owned())
            })
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
        let trimmed = label.trim();
        if trimmed.len() != label.len() {
            fields.shift_remove(trimmed);
        }
    }
    Ok(())
}
