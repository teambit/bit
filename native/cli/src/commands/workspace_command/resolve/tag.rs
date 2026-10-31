//! Which components `bit tag`'s patterns
//! select, and with which entered version; and the versions the plan gives
//! the tagged components.

#[cfg(test)]
mod tag_tests;

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
        let matches = matches(&identities, pattern)?;
        if matches.is_empty() {
            return Err(decline("tag pattern has no matches"));
        }
        for identity in matches {
            rows.push(json!({ "identity": identity, "version": version, "patternIndex": index }));
        }
        if rows.len() > 4096 {
            return Err(decline("tag selection budget"));
        }
    }
    Ok(Some(Value::Array(rows)))
}

fn matches<'i>(identities: &[&'i str], pattern: &str) -> io::Result<Vec<&'i str>> {
    if pattern.contains(['*', ',', '!']) {
        component_patterns::extended::matching(identities, &component_patterns::split(pattern))
    } else {
        Ok(vec![literal_match(identities, pattern)?])
    }
}

/// State predicates share diff's evaluator but retain the complete write capture.
pub fn selections_with_state(
    engine: &mut crate::commands::engine::Engine,
    root: &std::path::Path,
    context: &Value,
    patterns: &[String],
    capture: &crate::commands::status::capture::Capture,
) -> io::Result<(Option<Value>, Vec<usize>)> {
    if patterns.is_empty() {
        return Ok((None, Vec::new()));
    }
    let mut rows = Vec::new();
    let mut loads = Vec::new();
    for (index, entered) in patterns.iter().enumerate() {
        let (pattern, version) = split(entered)?;
        if crate::commands::diff::selection::stateful(pattern) {
            let targets = array(context.get("targets"), "tag state targets")?;
            let (matches, loading) = crate::commands::diff::selection::select_capture(
                engine, root, context, targets, pattern, capture,
            )?;
            loads.extend(loading);
            rows.extend(matches.iter().map(|target|json!({"identity":target["identity"],"version":version,"patternIndex":index})));
        } else {
            rows.extend(ordinary_selection(context, entered, index)?);
        }
    }
    Ok((Some(Value::Array(rows)), loads))
}

fn ordinary_selection(context: &Value, entered: &str, index: usize) -> io::Result<Vec<Value>> {
    let selected = selections(context, &[entered.to_string()])?
        .ok_or_else(|| decline("tag selection absent"))?;
    let mut rows = selected
        .as_array()
        .ok_or_else(|| decline("tag selection rows"))?
        .clone();
    for row in &mut rows {
        row["patternIndex"] = json!(index);
    }
    Ok(rows)
}

/// `pattern[@version]`, the version a semver version or a release type.
fn split(text: &str) -> io::Result<(&str, Option<&str>)> {
    let mut parts = text.trim().split('@');
    let pattern = parts
        .next()
        .map(str::trim)
        .filter(|pattern| !pattern.is_empty());
    let version = parts.next().map(str::trim);
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
        .filter_map(|row| row["version"].as_str().map(str::trim))
        .filter(|version| !version.is_empty())
        .map(str::to_string)
        .collect()
}

/// Exact versions recorded by `tag --soft` enter the same semantic grammar as `--ver`.
pub fn pending_versions(context: &Value) -> Vec<String> {
    context["targets"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|target| target["nextVersion"]["version"].as_str().map(str::trim))
        .filter(|version| node_semver::npm::valid(version).is_some())
        .map(str::to_owned)
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
        versions.insert(identity.trim(), version.trim());
    }
    identities
        .iter()
        .map(|identity| {
            versions
                .get(identity.trim())
                .map(|version| (*version).to_string())
                .ok_or_else(|| decline("native tag version"))
        })
        .collect()
}
