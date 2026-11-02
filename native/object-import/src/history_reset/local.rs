//! Local-only snap/tag selection ([`append`], [`Append`]) and `Version` parent resolution for `bit reset`.

use super::{bound, invalid, text};
use serde::Deserialize;
use serde_json::{Value, json};
use std::{collections::HashSet, io};
/// Deserialized `historyResetLocalAppend` request combining `sourceOnly` and `mainOnly` refs.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Append {
    source_only: Vec<String>,
    #[serde(default)]
    main_only: Vec<String>,
}
pub(super) fn append(input: Value) -> io::Result<Value> {
    let request: Append = serde_json::from_value(input).map_err(io::Error::other)?;
    refs(&request.source_only)?;
    refs(&request.main_only)?;
    let mut combined = request.source_only;
    let mut source_append = Vec::new();
    for (index, hash) in request.main_only.into_iter().enumerate() {
        let trimmed = hash.trim();
        if !combined
            .iter()
            .any(|existing| existing.trim() == trimmed)
        {
            combined.push(hash);
            source_append.push(index);
        }
    }
    bound(combined.len())?;
    Ok(json!({"sourceAppend":source_append,"combined":combined}))
}
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Select {
    source_only: Vec<String>,
    lane: bool,
    lane_head: Option<String>,
    metadata: Vec<Metadata>,
    tags: Vec<Tag>,
    orphaned: Vec<Tag>,
    last_found_tag: Option<String>,
    reverse: Option<bool>,
}
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Metadata {
    hash: String,
    #[serde(default)]
    missing: bool,
    #[serde(default)]
    origin_lane: bool,
    #[serde(default)]
    squashed: bool,
    #[serde(default)]
    unrelated: bool,
}
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(deny_unknown_fields)]
struct Tag {
    label: String,
    hash: String,
}
pub(super) fn select(input: Value) -> io::Result<Value> {
    let request: Select = serde_json::from_value(input).map_err(io::Error::other)?;
    validate(&request)?;
    let mut selected = Vec::with_capacity(request.source_only.len());
    for (index, hash) in request.source_only.iter().enumerate() {
        if eligible(&request, hash)? {
            selected.push(index);
        }
    }
    if request.reverse.unwrap_or(true) {
        selected.reverse();
    }
    let mut cached = request.last_found_tag.clone();
    let mut index = crate::tag_index::TagIndex::default();
    for tag in &request.orphaned {
        index.insert(tag.hash.trim(), tag.label.trim(), false);
    }
    for tag in &request.tags {
        index.insert(tag.hash.trim(), tag.label.trim(), true);
    }
    let labels = labels(&request, &selected, &index, &mut cached)?;
    let mut output = json!({"selected":selected.iter().map(|index|json!({"source":index})).collect::<Vec<_>>(),"labels":labels,"lastFoundTagPresent":cached.is_some()});
    if let Some(cached) = cached {
        output["lastFoundTag"] = Value::String(cached);
    }
    Ok(output)
}
fn labels(
    request: &Select,
    selected: &[usize],
    index: &crate::tag_index::TagIndex,
    cached: &mut Option<String>,
) -> io::Result<Vec<String>> {
    let mut total = 256
        + selected.len() * 48
        + cached
            .as_ref()
            .map_or(0, |value| value.len() * 6);
    let mut labels = Vec::with_capacity(selected.len());
    for selected_index in selected {
        let value = label(index, &request.source_only[*selected_index], cached);
        total += value.len() * 6 + 3;
        if total > 4 * 1024 * 1024 {
            return Err(invalid("reset label response limit"));
        }
        labels.push(value);
    }
    Ok(labels)
}
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Read {
    source_only: Vec<String>,
    lane_head: Option<String>,
}
pub(super) fn read(input: Value) -> io::Result<Value> {
    let request: Read = serde_json::from_value(input).map_err(io::Error::other)?;
    refs(&request.source_only)?;
    if let Some(hash) = &request.lane_head {
        crate::merge_history::hash(hash.trim())?;
    }
    let lane_head = request.lane_head.as_deref().map(str::trim);
    let load: Vec<_> = request.source_only
        .iter()
        .enumerate()
        .filter_map(|(index, hash)| {
            (!lane_head.is_some_and(|head| head.eq_ignore_ascii_case(hash.trim()))).then_some(index)
        })
        .collect();
    Ok(json!({"load":load}))
}
fn eligible(request: &Select, hash: &str) -> io::Result<bool> {
    let hash = hash.trim();
    if !request.lane
        || request.lane_head
            .as_deref()
            .map(str::trim)
            .is_some_and(|head| head.eq_ignore_ascii_case(hash))
    {
        return Ok(true);
    }
    let row = request.metadata
        .iter()
        .find(|row| row.hash.trim().eq_ignore_ascii_case(hash))
        .ok_or_else(|| invalid("history reset lane metadata missing"))?;
    Ok(!row.missing && (row.origin_lane || row.squashed || row.unrelated))
}
#[inline]
fn label(index: &crate::tag_index::TagIndex, hash: &str, cached: &mut Option<String>) -> String {
    let hash = hash.trim();
    let Some((label, normal)) = index.get(hash) else {
        return hash.to_owned();
    };
    if normal {
        *cached = Some(label.to_owned());
    }
    label.to_owned()
}

#[inline]
fn refs(values: &[String]) -> io::Result<()> {
    bound(values.len())?;
    for hash in values {
        crate::merge_history::hash(hash.trim())?;
    }
    Ok(())
}
fn validate(request: &Select) -> io::Result<()> {
    if let Some(cached) = &request.last_found_tag {
        text(cached)?;
    }
    refs(&request.source_only)?;
    bound(request.metadata.len())?;
    let mut seen = HashSet::with_capacity(request.metadata.len());
    for row in &request.metadata {
        let trimmed = row.hash.trim();
        crate::merge_history::hash(trimmed)?;
        if !seen.insert(trimmed.to_ascii_lowercase()) {
            return Err(invalid("duplicate lane metadata"));
        }
    }
    if let Some(hash) = &request.lane_head {
        crate::merge_history::hash(hash.trim())?;
    }
    tags(&request.tags)?;
    tags(&request.orphaned)?;
    Ok(())
}

fn tags(rows: &[Tag]) -> io::Result<()> {
    bound(rows.len())?;
    let mut seen = HashSet::with_capacity(rows.len());
    for row in rows {
        text(&row.label)?;
        crate::merge_history::hash(&row.hash)?;
        if !seen.insert(&row.label) {
            return Err(invalid("duplicate reset tag"));
        }
    }
    Ok(())
}
