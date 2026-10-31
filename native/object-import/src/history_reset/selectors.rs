use super::{bound, invalid, text};
use serde::Deserialize;
use serde_json::{Value, json};
use sha1::{Digest, Sha1};
use std::{collections::HashSet, io};
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Candidates {
    components: Vec<String>,
    removed: Vec<String>,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Pattern {
    components: Vec<String>,
    matches: Vec<String>,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Soft {
    versions: Vec<Option<String>>,
    aliases: Option<Vec<usize>>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Never {
    full_names: Vec<String>,
}
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
    let existing: HashSet<_> = request.components.iter().collect();
    let missing: Vec<_> = request.removed
        .iter()
        .enumerate()
        .filter_map(|(index, id)| (!existing.contains(id)).then_some(index))
        .collect();
    Ok(json!({"missing":missing}))
}
pub(super) fn pattern(input: Value) -> io::Result<Value> {
    let request: Pattern = serde_json::from_value(input).map_err(io::Error::other)?;
    validate(&request.components)?;
    validate(&request.matches)?;
    let matches: HashSet<_> = request.matches.iter().collect();
    let selected: Vec<_> = request.components
        .iter()
        .enumerate()
        .filter_map(|(index, id)| matches.contains(id).then_some(index))
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
                    .any(|index| *index >= 4096)
        })
    {
        return Err(invalid("soft reset aliases"));
    }
    let mut cleared = HashSet::new();
    let mut selected = Vec::new();
    for (index, version) in request.versions.iter().enumerate() {
        let alias = request.aliases
            .as_ref()
            .map_or(index, |aliases| aliases[index]);
        if let Some(version) = version
            .as_ref()
            .filter(|version| !version.is_empty())
            && !cleared.contains(&alias)
        {
            text(version)?;
            selected.push(index);
            cleared.insert(alias);
        }
    }
    Ok(json!({"selected":selected}))
}
pub(super) fn never(input: Value) -> io::Result<Value> {
    let request: Never = serde_json::from_value(input).map_err(io::Error::other)?;
    validate(&request.full_names)?;
    let hashes: Vec<_> = request.full_names
        .iter()
        .map(|name| crate::validate::hexadecimal(&Sha1::digest(name.as_bytes())))
        .collect();
    let mut seen = HashSet::new();
    let unique: Vec<_> = hashes
        .iter()
        .enumerate()
        .filter_map(|(index, hash)| seen.insert(hash).then_some(index))
        .collect();
    Ok(json!({"hashes":hashes,"unique":unique}))
}
