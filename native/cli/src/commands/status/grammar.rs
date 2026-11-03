//! The npm `semver` facts the status engine asks for, computed with
//! [`npm`], the port of npm `semver` 7.7.1's strict functions.
//!
//! [`snapshot`], [`dependency`], and [`config_inputs`] serialize canonical version text and [`Identifier`] components into a [`Map`]-backed [`Value`].

use node_semver::npm::{self, Identifier};
use serde_json::{Map, Value, json};

/// Computes `snapshotSemverGrammar(values)`: canonical version text and parsed parts ([`snapshot_entry`]) for each valid version.
pub fn snapshot<'v>(values: impl IntoIterator<Item = &'v str>) -> Option<Value> {
    let mut result = Map::new();
    for text in values {
        if result.contains_key(text) {
            continue;
        }
        if result.len() >= 4096 || text.encode_utf16().count() > 4096 {
            return None;
        }
        result.insert(text.to_string(), snapshot_entry(text));
    }
    Some(Value::Object(result))
}

/// Formats the canonical semver grammar entry for a single version string `text` via [`npm::parse`].
#[inline]
fn snapshot_entry(text: &str) -> Value {
    let Some(version) = npm::parse(text.trim()) else { return json!({}) };
    json!({
        "canonicalText": version.version,
        "version": version_parts(&version),
    })
}

/// `dependencyGrammar(values)`: `valid`, `validRange` and `coerce` of every
/// string anywhere in `values`.
#[must_use]
pub fn dependency(values: &Value) -> Value {
    let mut strings = Vec::new();
    visit(values, &mut strings);
    let mut result = Map::new();
    for text in strings {
        if result.contains_key(text) || text.encode_utf16().count() > 4096 {
            continue;
        }
        if result.len() >= 16384 {
            break;
        }
        let trimmed = text.trim();
        let coerced = npm::coerce(trimmed).map(|version| version.version);
        let entry = json!({
            "valid": npm::valid(trimmed).is_some(),
            "range": npm::valid_range(trimmed).is_some(),
            "coerced": coerced,
        });
        result.insert(text.to_string(), entry);
    }
    Value::Object(result)
}

/// Recursively appends every string slice inside `value` ([`Value`]) onto `strings`.
#[inline]
fn visit<'v>(value: &'v Value, strings: &mut Vec<&'v str>) {
    match value {
        Value::String(text) => strings.push(text),
        Value::Array(items) => items.iter().for_each(|item| visit(item, strings)),
        Value::Object(map) => map.values().for_each(|item| visit(item, strings)),
        _ => {}
    }
}

/// `normalizeSemverInputs` of `@teambit/config-merger` over every string in
/// `values`: the parsed version, the comparator sets and the minimum of
/// each. `None` for values outside the ported grammar.
#[must_use]
pub fn config_inputs(values: &Value) -> Option<Value> {
    let mut strings = Vec::new();
    visit(values, &mut strings);
    let mut seen = std::collections::HashSet::with_capacity(strings.len());
    let mut unique: Vec<&str> = Vec::with_capacity(strings.len());
    for text in strings {
        if seen.insert(text) {
            unique.push(text);
        }
    }
    let bytes: usize = unique
        .iter()
        .map(|text| text.len())
        .sum();
    if unique.len() > 4096
        || bytes > 4 * 1024 * 1024
        || unique
            .iter()
            .any(|text| text.encode_utf16().count() > 4096)
    {
        return None;
    }
    let mut result = Map::new();
    for text in unique {
        result.insert(text.to_string(), config_input(text)?);
    }
    Some(Value::Object(result))
}

/// One comparator set: each comparator's operator and version parts.
#[inline]
fn comparator_set(set: &[npm::Comparator]) -> Value {
    let comparators = set
        .iter()
        .map(|comparator| {
            let mut row = json!({ "operator": comparator.operator });
            if let Some(version) = &comparator.version {
                row["version"] = version_parts(version);
            }
            row
        });
    Value::Array(comparators.collect())
}

#[inline]
fn config_input(text: &str) -> Option<Value> {
    let text = text.trim();
    let mut input = Map::new();
    if let Some(version) = npm::parse(text) {
        input.insert("version".into(), version_parts(&version));
    }
    if npm::valid_range(text).is_some() {
        let sets = npm::range_set(text)?;
        let range: Vec<Value> = sets
            .iter()
            .map(|set| comparator_set(set))
            .collect();
        input.insert("range".into(), Value::Array(range));
        if let Some(minimum) = npm::min_version(text).ok()? {
            input.insert("minimum".into(), version_parts(&minimum));
            input.insert("minimumText".into(), json!(minimum.version));
        }
    }
    Some(Value::Object(input))
}

/// `{ major, minor, patch, prerelease }` of a parsed version.
#[inline]
fn version_parts(version: &npm::Version) -> Value {
    let prerelease: Vec<Value> = version.prerelease
        .iter()
        .map(|id| match id {
            Identifier::Numeric(number) => json!(number),
            Identifier::Alphanumeric(text) => json!(text),
        })
        .collect();
    json!({ "major": version.major, "minor": version.minor, "patch": version.patch, "prerelease": prerelease })
}
