//! Which components `bit tag`'s patterns
//! select, and with which entered version; and the versions the plan gives
//! the tagged components.

use crate::commands::{
    patterns as component_patterns,
    status::js::{array, decline, text},
};
use serde_json::{Value, json};
use std::{collections::HashMap, io};

/// The release types a pattern may carry in place of a version.
const RELEASE_TYPES: [&str; 7] =
    ["major", "premajor", "minor", "preminor", "patch", "prepatch", "prerelease"];

/// `tagPatternSelections(context, patterns)`: `{ identity, version,
/// patternIndex }` rows, `None` without patterns: globs and lists match
/// with `multimatch`, a literal names exactly one component.
pub fn selections(context: &Value, patterns: &[String]) -> io::Result<Option<Value>> {
    if patterns.is_empty() {
        return Ok(None);
    }
    let identities: Vec<&str> = array(context.get("targets"), "targets")?
        .iter()
        .map(|target| text(target.get("identity")))
        .collect::<io::Result<_>>()?;
    let mut rows = Vec::new();
    for (index, pattern) in patterns.iter().enumerate() {
        let (pattern, version) = split(pattern)?;
        let matches = if pattern.contains('*') || pattern.contains(',') {
            component_patterns::matching(&identities, &component_patterns::split(pattern))?
        } else {
            vec![literal_match(&identities, pattern)?]
        };
        for identity in matches {
            rows.push(json!({ "identity": identity, "version": version, "patternIndex": index }));
        }
        if rows.len() > 4096 {
            return Err(decline("tag selection budget"));
        }
    }
    Ok(Some(Value::Array(rows)))
}

/// `pattern[@version]`, the version a semver version or a release type.
fn split(text: &str) -> io::Result<(&str, Option<&str>)> {
    let mut parts = text.split('@');
    let pattern = parts
        .next()
        .filter(|pattern| !pattern.is_empty());
    let version = parts.next();
    let (Some(pattern), None) = (pattern, parts.next()) else {
        return Err(decline("tag pattern version"));
    };
    let valid = |version: &str| {
        node_semver::npm::valid(version).is_some() || RELEASE_TYPES.contains(&version)
    };
    if version.is_some_and(|version| !valid(version)) {
        return Err(decline("tag per-pattern version"));
    }
    Ok((pattern, version))
}

/// The one component a literal names: its id, or the id ending in
/// `/<pattern>`. Globs and lists are matched by `multimatch` in Node.
fn literal_match<'i>(identities: &[&'i str], pattern: &str) -> io::Result<&'i str> {
    let literal = pattern
        .chars()
        .all(|character| character.is_ascii_alphanumeric() || "_./-".contains(character));
    if pattern.contains('*') || pattern.contains(',') || !literal {
        return Err(decline("tag pattern outside the native grammar"));
    }
    let suffix = format!("/{pattern}");
    let mut matches = identities
        .iter()
        .filter(|id| **id == pattern || id.ends_with(&suffix));
    match (matches.next(), matches.next()) {
        (Some(identity), None) => Ok(identity),
        _ => Err(decline("tag unresolved literal identity")),
    }
}

/// The versions entered per pattern, for the semver grammar.
pub fn entered_versions(selections: Option<&Value>) -> Vec<String> {
    selections
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|row| row["version"].as_str().map(str::to_string))
        .collect()
}

/// Each component's new version, from the plan's tagged and auto-tagged ids.
pub fn planned_versions(result: &Value, identities: &[String]) -> io::Result<Vec<String>> {
    let automatic = array(result.get("autoTaggedResults"), "auto-tagged components")?
        .iter()
        .map(|row| &row["id"]);
    let ids = array(result.get("taggedComponents"), "tagged components")?.iter().chain(automatic);
    let mut versions = HashMap::new();
    for id in ids {
        let (identity, version) =
            text(Some(id))?.rsplit_once('@').ok_or_else(|| decline("native tag version"))?;
        versions.insert(identity, version);
    }
    identities
        .iter()
        .map(|identity| {
            versions
                .get(identity.as_str())
                .map(|version| (*version).to_string())
                .ok_or_else(|| decline("native tag version"))
        })
        .collect()
}

#[cfg(test)]
mod tag_tests;
