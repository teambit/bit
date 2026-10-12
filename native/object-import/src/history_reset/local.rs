use super::{bound, invalid, text};
use serde::Deserialize;
use serde_json::{Value, json};
use std::{collections::HashSet, io};
#[derive(Deserialize)]
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
        if !combined.contains(&hash) {
            combined.push(hash);
            source_append.push(index);
        }
    }
    bound(combined.len())?;
    Ok(json!({"sourceAppend":source_append,"combined":combined}))
}
#[derive(Deserialize)]
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
#[derive(Deserialize)]
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
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Tag {
    label: String,
    hash: String,
}
pub(super) fn select(input: Value) -> io::Result<Value> {
    let request: Select = serde_json::from_value(input).map_err(io::Error::other)?;
    validate(&request)?;
    let mut selected = Vec::new();
    for (index, hash) in request.source_only.iter().enumerate() {
        if eligible(&request, hash)? {
            selected.push(index);
        }
    }
    if request.reverse.unwrap_or(true) {
        selected.reverse();
    }
    let mut cached = request.last_found_tag.clone();
    let labels = labels(&request, &selected, &mut cached)?;
    let mut output = json!({"selected":selected.iter().map(|index|json!({"source":index})).collect::<Vec<_>>(),"labels":labels,"lastFoundTagPresent":cached.is_some()});
    if let Some(cached) = cached {
        output["lastFoundTag"] = Value::String(cached);
    }
    Ok(output)
}
fn labels(
    request: &Select,
    selected: &[usize],
    cached: &mut Option<String>,
) -> io::Result<Vec<String>> {
    let mut total = 256
        + selected.len() * 48
        + cached
            .as_ref()
            .map_or(0, |value| value.len() * 6);
    let mut labels = Vec::new();
    for index in selected {
        let value = label(request, &request.source_only[*index], cached);
        total += value.len() * 6 + 3;
        if total > 4 * 1024 * 1024 {
            return Err(invalid("reset label response limit"));
        }
        labels.push(value);
    }
    Ok(labels)
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Read {
    source_only: Vec<String>,
    lane_head: Option<String>,
}
pub(super) fn read(input: Value) -> io::Result<Value> {
    let request: Read = serde_json::from_value(input).map_err(io::Error::other)?;
    refs(&request.source_only)?;
    if let Some(hash) = &request.lane_head {
        crate::merge_history::hash(hash)?;
    }
    let load: Vec<_> = request.source_only
        .iter()
        .enumerate()
        .filter_map(|(index, hash)| (request.lane_head.as_ref() != Some(hash)).then_some(index))
        .collect();
    Ok(json!({"load":load}))
}
fn eligible(request: &Select, hash: &str) -> io::Result<bool> {
    if !request.lane || request.lane_head.as_deref() == Some(hash) {
        return Ok(true);
    }
    let row = request.metadata
        .iter()
        .find(|row| row.hash == hash)
        .ok_or_else(|| invalid("history reset lane metadata missing"))?;
    Ok(!row.missing && (row.origin_lane || row.squashed || row.unrelated))
}
fn label(request: &Select, hash: &str, cached: &mut Option<String>) -> String {
    if let Some(found) = cached
        .as_ref()
        .and_then(|label| {
            request.tags
                .iter()
                .find(|row| row.label == *label && row.hash == hash)
        })
    {
        return found.label.clone();
    }
    if let Some(found) = request.tags
        .iter()
        .rfind(|row| row.hash == hash)
    {
        *cached = Some(found.label.clone());
        return found.label.clone();
    }
    request.orphaned
        .iter()
        .rfind(|row| row.hash == hash)
        .map_or_else(|| hash.into(), |row| row.label.clone())
}
fn refs(values: &[String]) -> io::Result<()> {
    bound(values.len())?;
    for hash in values {
        crate::merge_history::hash(hash)?;
    }
    Ok(())
}
fn validate(request: &Select) -> io::Result<()> {
    if let Some(cached) = &request.last_found_tag {
        text(cached)?;
    }
    refs(&request.source_only)?;
    bound(request.metadata.len())?;
    let mut seen = HashSet::new();
    for row in &request.metadata {
        crate::merge_history::hash(&row.hash)?;
        if !seen.insert(&row.hash) {
            return Err(invalid("duplicate lane metadata"));
        }
    }
    if let Some(hash) = &request.lane_head {
        crate::merge_history::hash(hash)?;
    }
    tags(&request.tags)?;
    tags(&request.orphaned)?;
    Ok(())
}

fn tags(rows: &[Tag]) -> io::Result<()> {
    bound(rows.len())?;
    let mut seen = HashSet::new();
    for row in rows {
        text(&row.label)?;
        crate::merge_history::hash(&row.hash)?;
        if !seen.insert(&row.label) {
            return Err(invalid("duplicate reset tag"));
        }
    }
    Ok(())
}
