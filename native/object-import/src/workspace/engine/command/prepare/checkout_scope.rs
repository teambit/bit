//! Default-scope [`Candidate`] components listed by the native inbound transport for `checkout head`.

use super::{Prepare, config, invalid};
use crate::{
    command_import::{self, PreparedImport},
    workspace::engine::status_context,
};
use serde_json::{Value, json};
use std::{collections::HashSet, io};

/// A remote default-scope component candidate discovered for `checkout head`.
#[derive(Debug, Clone, PartialEq, Eq)]
struct Candidate {
    identity: String,
    scope: String,
    name: String,
    version: String,
}

/// Parses and deduplicates `scope_candidates` (`scope/name@version`) from `request.options.scope`.
fn candidates(request: &Prepare) -> io::Result<Vec<Candidate>> {
    if request.options.scope.scope_candidates.len() > 4096 {
        return Err(invalid("checkout scope candidate limit"));
    }
    let mut seen = HashSet::with_capacity(request.options.scope.scope_candidates.len());
    request.options.scope.scope_candidates
        .iter()
        .map(|text| {
            let (identity, version) = text
                .trim()
                .rsplit_once('@')
                .map(|(identity, version)| (identity.trim(), version.trim()))
                .ok_or_else(|| invalid("checkout scope candidate version"))?;
            let (scope, name) = identity
                .split_once('/')
                .map(|(scope, name)| (scope.trim(), name.trim()))
                .ok_or_else(|| invalid("checkout scope candidate identity"))?;
            if scope.is_empty() || name.is_empty() || version.is_empty() || !seen.insert(identity) {
                return Err(invalid("checkout scope duplicate or incomplete candidate"));
            }
            command_import::lane::component_identity(&json!({"scope":scope,"name":name}))?;
            Ok(Candidate {
                identity: identity.to_owned(),
                scope: scope.to_owned(),
                name: name.to_owned(),
                version: version.to_owned(),
            })
        })
        .collect()
}

/// Converts discovered default-scope [`Candidate`] entries into [`command_import::Target`] descriptors.
fn import_targets(candidates: &[Candidate]) -> Vec<command_import::Target> {
    candidates
        .iter()
        .map(|candidate| command_import::Target {
            scope: Some(candidate.scope.clone()),
            name: candidate.name.clone(),
            version: candidate.version.clone(),
        })
        .collect()
}

/// Attaches `scopeAdditions`, `scopeAddedTargets`, and `newFromScope` to `context` when enabled.
pub(super) fn attach(
    request: &Prepare,
    context: &mut Value,
    imported: Option<&mut PreparedImport>,
) -> io::Result<()> {
    if !request.options.scope.include_new_from_scope {
        return Ok(());
    }
    let imported = imported.ok_or_else(|| invalid("checkout scope import owner"))?;
    let default_scope = crate::component_tracking::identity::workspace_aspect(
        &context["workspace"],
    )["defaultScope"]
        .as_str();
    let bitmap = config::document(&request.root.join(".bitmap"))?;
    let settings = config::configuration_value(
        &request.root,
        &status_context::configuration::effective(&request.root, &request.home)?,
        true,
    )?;
    let bitmap = super::super::lane_context::visibility::identity_bitmap(&bitmap, &settings)?;
    let missing = missing(request, &bitmap, default_scope)?;
    if !missing.is_empty() {
        imported.prepare_scope_additions(&import_targets(&missing))?;
    }
    let (selected, names) = select(&missing, imported)?;
    let mut additions = super::super::lane_context::additions::prepare_switch(
        imported,
        &request.root,
        &bitmap,
        &settings,
        &selected,
    )?;
    assign_addition_versions(&mut additions, &names)?;
    validate_lane_overlap(context, &additions)?;
    context["scopeAdditions"] = json!(additions);
    context["scopeAddedTargets"] =
        json!(super::super::lane_context::additions::targets(&additions, &selected));
    context["newFromScope"] = json!(names);
    Ok(())
}

fn assign_addition_versions(additions: &mut [Value], names: &[String]) -> io::Result<()> {
    for (addition, name) in additions.iter_mut().zip(names) {
        addition["version"] = json!(
            name.rsplit_once('@')
                .ok_or_else(|| invalid("checkout scope version"))?
                .1
                .trim()
        );
    }
    Ok(())
}

fn missing(
    request: &Prepare,
    bitmap: &Value,
    default_scope: Option<&str>,
) -> io::Result<Vec<Candidate>> {
    let default_scope = default_scope
        .map(str::trim)
        .filter(|scope| !scope.is_empty());
    let tracked = super::checkout_lane::bitmap_identities(bitmap)?;
    Ok(candidates(request)?
        .into_iter()
        .filter(|candidate| {
            Some(candidate.scope.as_str()) == default_scope
                && !tracked.contains(&candidate.identity)
        })
        .collect())
}

fn normalized_root_dir(value: &Value, error: &'static str) -> io::Result<String> {
    let raw = value
        .as_str()
        .map(str::trim)
        .filter(|dir| !dir.is_empty())
        .ok_or_else(|| invalid(error))?;
    let slashed = raw.replace('\\', "/");
    let stripped = slashed
        .strip_prefix("./")
        .unwrap_or(&slashed)
        .trim_end_matches('/');
    Ok(if stripped.is_empty() { ".".to_owned() } else { stripped.to_owned() })
}

fn validate_lane_overlap(context: &Value, additions: &[Value]) -> io::Result<()> {
    let lane = context["lane"]["additions"]
        .as_array()
        .map_or(&[][..], Vec::as_slice);
    for addition in additions {
        let root = normalized_root_dir(&addition["rootDir"], "checkout scope root")?;
        for existing in lane {
            let other = normalized_root_dir(&existing["rootDir"], "checkout lane root")?;
            if root == other
                || root == "."
                || other == "."
                || std::path::Path::new(&root).starts_with(&other)
                || std::path::Path::new(&other).starts_with(&root)
            {
                return Err(invalid("checkout scope overlaps lane addition"));
            }
        }
    }
    Ok(())
}

fn select(
    candidates: &[Candidate],
    imported: &mut PreparedImport,
) -> io::Result<(Vec<Value>, Vec<String>)> {
    let mut selected = Vec::with_capacity(candidates.len());
    let mut names = Vec::with_capacity(candidates.len());
    for candidate in candidates {
        let model = imported
            .lane_model(&candidate.identity)?
            .ok_or_else(|| invalid("checkout scope model absent"))?;
        let reference = version_ref(&model, &candidate.version)?;
        let version = imported.lane_version(&reference)?;
        if super::super::selection::removed(&version)? {
            continue;
        }
        selected.push(json!({"identity":candidate.identity,"head":reference,
            "currentIdPresent":false,"bitmapPresent":false}));
        names.push(format!("{}@{}", candidate.identity, candidate.version));
    }
    Ok((selected, names))
}

pub(super) fn extend_model_targets(context: &Value, targets: &mut Vec<Value>) {
    if let Some(rows) = context["scopeAddedTargets"].as_array() {
        targets.extend(
            rows.iter()
                .map(|row| json!({"identity":row["identity"],"version":row["version"]})),
        );
    }
}

fn version_ref(model: &Value, version: &str) -> io::Result<String> {
    let version = version.trim();
    let reference = if version.is_empty()
        || version.eq_ignore_ascii_case("latest")
        || version.eq_ignore_ascii_case("head")
    {
        model["head"].as_str().map(str::trim)
    } else {
        model["orphanedVersions"]
            .get(version)
            .or_else(|| model["versions"].get(version))
            .and_then(Value::as_str)
            .map(str::trim)
            .or_else(|| (crate::merge_history::hash(version).is_ok()).then_some(version))
    }
    .ok_or_else(|| invalid("checkout scope listed version absent"))?;
    crate::merge_history::hash(reference)?;
    Ok(reference.to_owned())
}
