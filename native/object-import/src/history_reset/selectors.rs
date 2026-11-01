use super::{bound, invalid, text};
use serde::Deserialize;
use serde_json::{Value, json};
use sha1::{Digest, Sha1};
use std::{collections::HashSet, io};
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(deny_unknown_fields)]
struct Candidates {
    components: Vec<String>,
    removed: Vec<String>,
}
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(deny_unknown_fields)]
struct Pattern {
    components: Vec<String>,
    matches: Vec<String>,
}
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(deny_unknown_fields)]
struct Soft {
    versions: Vec<Option<String>>,
    aliases: Option<Vec<usize>>,
}
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Never {
    full_names: Vec<String>,
}
#[inline]
fn validate(values: &[String]) -> io::Result<()> {
    bound(values.len())?;
    for value in values {
        text(value)?;
    }
    Ok(())
}
pub(super) fn candidates(input: Value) -> io::Result<Value> {
    let request: Candidates = serde_json::from_value(input).map_err(io::Error::other)?;
    validate(&request.components)?;
    validate(&request.removed)?;
    let existing: HashSet<_> = request.components
        .iter()
        .map(|id| id.trim())
        .collect();
    let missing: Vec<_> = request.removed
        .iter()
        .enumerate()
        .filter_map(|(index, id)| (!existing.contains(id.trim())).then_some(index))
        .collect();
    Ok(json!({"missing":missing}))
}
pub(super) fn pattern(input: Value) -> io::Result<Value> {
    let request: Pattern = serde_json::from_value(input).map_err(io::Error::other)?;
    validate(&request.components)?;
    validate(&request.matches)?;
    let matches: HashSet<_> = request.matches
        .iter()
        .map(|id| id.trim())
        .collect();
    let selected: Vec<_> = request.components
        .iter()
        .enumerate()
        .filter_map(|(index, id)| matches.contains(id.trim()).then_some(index))
        .collect();
    Ok(json!({"selected":selected}))
}
pub(super) fn soft(input: Value) -> io::Result<Value> {
    let request: Soft = serde_json::from_value(input).map_err(io::Error::other)?;
    bound(request.versions.len())?;
    if request.aliases
        .as_ref()
        .is_some_and(|aliases| {
            aliases.len() != request.versions.len()
                || aliases
                    .iter()
                    .any(|index| *index >= request.versions.len())
        })
    {
        return Err(invalid("soft reset aliases"));
    }
    let mut cleared = HashSet::with_capacity(request.versions.len());
    let mut selected = Vec::with_capacity(request.versions.len());
    for (index, version) in request.versions.iter().enumerate() {
        let alias = request.aliases
            .as_ref()
            .map_or(index, |aliases| aliases[index]);
        if let Some(version) = version
            .as_deref()
            .map(str::trim)
            .filter(|version| !version.is_empty())
        {
            text(version)?;
            if cleared.insert(alias) {
                selected.push(index);
            }
        }
    }
    Ok(json!({"selected":selected}))
}
pub(super) fn never(input: Value) -> io::Result<Value> {
    let request: Never = serde_json::from_value(input).map_err(io::Error::other)?;
    validate(&request.full_names)?;
    let mut hashes = Vec::with_capacity(request.full_names.len());
    let mut seen = HashSet::with_capacity(request.full_names.len());
    let mut unique = Vec::with_capacity(request.full_names.len());
    for (index, name) in request.full_names.iter().enumerate() {
        let hash = crate::validate::hexadecimal(&Sha1::digest(name.trim().as_bytes()));
        if seen.insert(hash.clone()) {
            unique.push(index);
        }
        hashes.push(hash);
    }
    Ok(json!({"hashes":hashes,"unique":unique}))
}
