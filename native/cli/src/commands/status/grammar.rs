//! The npm `semver` facts the status engine asks for, computed with
//! `node_semver::npm`, the port of npm `semver` 7.7.1's strict functions.

use node_semver::npm::{self, Identifier};
use serde_json::{Map, Value, json};

/// `snapshotSemverGrammar(values)`: canonical text and parts of each valid version.
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

fn snapshot_entry(text: &str) -> Value {
    let Some(version) = npm::parse(text) else { return json!({}) };
    let prerelease: Vec<Value> = version.prerelease
        .iter()
        .map(|id| match id {
            Identifier::Numeric(number) => json!(number),
            Identifier::Alphanumeric(text) => json!(text),
        })
        .collect();
    json!({
        "canonicalText": version.version,
        "version": {
            "major": version.major,
            "minor": version.minor,
            "patch": version.patch,
            "prerelease": prerelease,
        },
    })
}

/// `dependencyGrammar(values)`: `valid`, `validRange` and `coerce` of every
/// string anywhere in `values`.
pub fn dependency(values: &Value) -> Value {
    let mut strings = Vec::new();
    visit(values, &mut strings);
    let mut result = Map::new();
    for text in strings {
        if result.contains_key(text) {
            continue;
        }
        let coerced = npm::coerce(text).map(|version| version.version);
        let entry = json!({
            "valid": npm::valid(text).is_some(),
            "range": npm::valid_range(text).is_some(),
            "coerced": coerced,
        });
        result.insert(text.to_string(), entry);
    }
    Value::Object(result)
}

fn visit<'v>(value: &'v Value, strings: &mut Vec<&'v str>) {
    match value {
        Value::String(text) => strings.push(text),
        Value::Array(items) => items.iter().for_each(|item| visit(item, strings)),
        Value::Object(map) => map.values().for_each(|item| visit(item, strings)),
        _ => {}
    }
}
