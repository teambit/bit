//! Bare-scope target resolution for `bit artifacts`.

use super::extractor::TargetComponent;
use crate::commands::{debug_cat::lookup::resolve_component_entry, patterns, scope_set::Failure};
use serde_json::Value;
use std::{fs, path::Path};

pub(super) fn resolve_bare_scope_targets(
    scope_dir: &Path,
    pattern: &str,
) -> Result<Vec<TargetComponent>, Failure> {
    let scope_bytes =
        fs::read(scope_dir.join("scope.json")).map_err(|err| Failure::Declined(err.to_string()))?;
    let scope_val: Value =
        serde_json::from_slice(&scope_bytes).map_err(|err| Failure::Declined(err.to_string()))?;
    let scope_name = scope_val["name"]
        .as_str()
        .filter(|name| !name.is_empty())
        .ok_or_else(|| Failure::Declined("missing bare scope name".into()))?;
    if !pattern.contains(['*', ',', '!', '$', ':']) {
        return resolve_bare_literal_target(scope_dir, scope_name, pattern);
    }
    resolve_bare_pattern_targets(scope_dir, scope_name, pattern)
}

fn resolve_bare_literal_target(
    scope_dir: &Path,
    scope_name: &str,
    pattern: &str,
) -> Result<Vec<TargetComponent>, Failure> {
    let (bare_id, explicit_ver) = pattern
        .rsplit_once('@')
        .map_or((pattern, None), |(id, ver)| (id, Some(ver)));
    if bare_id.is_empty() || explicit_ver == Some("") {
        return Err(Failure::Declined("invalid component id".into()));
    }
    let Some((Some(scope), comp_name, _)) = resolve_component_entry(scope_dir, bare_id) else {
        if !bare_id.starts_with('@')
            && (!bare_id.contains('/') || bare_id.starts_with(&format!("{scope_name}/")))
        {
            return Err(Failure::User(format!(r#"unable to find "{pattern}" in the scope"#)));
        }
        return Err(Failure::Declined("literal component not found in bare scope".into()));
    };
    if scope != scope_name {
        return Err(Failure::Declined("external component in bare scope".into()));
    }
    Ok(vec![TargetComponent {
        identity_no_ver: format!("{scope}/{comp_name}"),
        comp_name,
        version: Some(explicit_ver.unwrap_or("latest").to_owned()),
    }])
}

fn resolve_bare_pattern_targets(
    scope_dir: &Path,
    scope_name: &str,
    pattern: &str,
) -> Result<Vec<TargetComponent>, Failure> {
    if pattern
        .split(',')
        .map(str::trim)
        .any(|part| part.starts_with('$') || part.contains(':') || part.contains(" AND "))
    {
        return Err(Failure::Declined("unsupported bare scope artifacts pattern".into()));
    }
    let candidates = load_bare_scope_candidates(scope_dir, scope_name)?;
    let refs = candidates
        .iter()
        .map(|(identity, _)| identity.as_str())
        .collect::<Vec<_>>();
    let matched = patterns::matching(&refs, &patterns::split(pattern))
        .map_err(|_| Failure::Declined("unsupported bare scope artifacts pattern".into()))?;
    if matched.is_empty() {
        return Err(Failure::User(format!(
            r#"unable to find any component matching the "{pattern}" pattern"#,
        )));
    }
    let mut targets = Vec::with_capacity(matched.len());
    for id in matched {
        let Some((identity, comp_name)) = candidates
            .iter()
            .find(|(cand, _)| cand == id)
        else {
            continue;
        };
        targets.push(TargetComponent {
            identity_no_ver: identity.clone(),
            comp_name: comp_name.clone(),
            version: Some("latest".to_owned()),
        });
    }
    Ok(targets)
}

fn load_bare_scope_candidates(
    scope_dir: &Path,
    scope_name: &str,
) -> Result<Vec<(String, String)>, Failure> {
    let bytes =
        fs::read(scope_dir.join("index.json")).map_err(|err| Failure::Declined(err.to_string()))?;
    let index: Value =
        serde_json::from_slice(&bytes).map_err(|err| Failure::Declined(err.to_string()))?;
    let rows = index["components"]
        .as_array()
        .or_else(|| index.as_array())
        .ok_or_else(|| Failure::Declined("invalid index.json".into()))?;
    if rows.len() > 128 {
        return Err(Failure::Declined("bare scope component count exceeds native cap".into()));
    }
    let mut candidates = Vec::new();
    for row in rows
        .iter()
        .filter(|row| row["isSymlink"] != true)
    {
        let scope = row["id"]["scope"]
            .as_str()
            .ok_or_else(|| Failure::Declined("missing scope in index".into()))?;
        if scope != scope_name {
            return Err(Failure::Declined("cached external component in bare scope".into()));
        }
        let name = row["id"]["name"]
            .as_str()
            .ok_or_else(|| Failure::Declined("missing name in index".into()))?;
        let hash = row["hash"]
            .as_str()
            .ok_or_else(|| Failure::Declined("missing hash in index".into()))?;
        let (kind, comp_val) = bit_object_import::read_scope_object(scope_dir, hash)
            .ok()
            .flatten()
            .ok_or_else(|| Failure::Declined("missing Component object".into()))?;
        if kind != "Component" {
            return Err(Failure::Declined("unexpected non-Component in index".into()));
        }
        if comp_val["head"].as_str().is_some() {
            candidates.push((format!("{scope}/{name}"), name.to_owned()));
        }
    }
    Ok(candidates)
}
