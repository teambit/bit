use super::{Request as Initial, finalize, invalid, packages_on_disk, versions};
use crate::workspace::engine::source_overlay::SourceOverlay;
use serde::Deserialize;
use serde_json::{Map, Value, json};
use std::{collections::HashSet, io, path::PathBuf};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct Request {
    root: PathBuf,
    component_root: PathBuf,
    initial: Initial,
    finish: Value,
    resolution: Resolution,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Resolution {
    sources: Value,
    extensions: Vec<String>,
    grammar: Value,
    prefix: Option<String>,
    merge: [Map<String, Value>; 3],
}

/// The cold command owns these inputs: no public callbacks or dependency aliases
/// exist between policy phases, package reads and version selection.
pub(in crate::workspace::engine) fn apply(
    request: &Request,
    pool: &rayon::ThreadPool,
) -> io::Result<(usize, Value)> {
    apply_view(request, pool, None)
}
pub(in crate::workspace::engine) fn apply_overlay(
    request: &Request,
    pool: &rayon::ThreadPool,
    overlay: &SourceOverlay,
) -> io::Result<(usize, Value)> {
    apply_view(request, pool, Some(overlay))
}
fn apply_view(
    request: &Request,
    pool: &rayon::ThreadPool,
    overlay: Option<&SourceOverlay>,
) -> io::Result<(usize, Value)> {
    let (_, initial) = super::apply(&request.initial)?;
    let mut finish = finish_request(request, &initial)?;
    let names = package_names(&finish)?;
    let package_request = serde_json::from_value(json!({"root":request.root,
        "componentRoot":request.component_root,"names":names}))
    .map_err(io::Error::other)?;
    let (_, packages) = match overlay {
        Some(view) => packages_on_disk::read_overlay(&package_request, pool, view)?,
        None => packages_on_disk::read(&package_request, pool)?,
    };
    finish["resolved"] = packages["resolved"].clone();
    let (_, mut output) =
        finalize::apply(&serde_json::from_value(finish).map_err(io::Error::other)?)?;
    let (_, selected) = versions::apply(&version_request(request, &output)?)?;
    output["state"]["entries"] = selected["entries"].clone();
    output["extensions"] = selected["extensions"].clone();
    output["removed"] = initial["removed"].clone();
    output["detectedMissing"] = initial["missing"].clone();
    if overlay.is_some() {
        output["readSet"] = packages["readSet"].clone();
    }
    Ok((1, output))
}

fn finish_request(request: &Request, initial: &Value) -> io::Result<Value> {
    let mut finish = request.finish.clone();
    let fields = finish.as_object().ok_or_else(|| invalid("dependency pipeline finalization"))?;
    if fields.contains_key("state") || fields.contains_key("resolved") {
        return Err(invalid("dependency pipeline owns intermediate state"));
    }
    let mut entries = request.initial.entries.clone();
    for (index, entry) in entries.iter_mut().enumerate() {
        entry.version_range = initial["ranges"][index]
            .as_str()
            .map(str::trim)
            .filter(|range| !range.is_empty())
            .map(str::to_owned);
    }
    finish["state"] = json!({"entries":entries,"packages":initial["packages"],
        "components":initial["components"]});
    finish["resolved"] = json!({});
    // Validate all policy input before doing any package filesystem reads.
    let parsed = serde_json::from_value(finish.clone()).map_err(io::Error::other)?;
    finalize::validate(&parsed)?;
    Ok(finish)
}

fn package_names(finish: &Value) -> io::Result<Vec<String>> {
    let environment = finish["environment"]["policy"]
        .as_object()
        .ok_or_else(|| invalid("dependency pipeline environment policy"))?;
    let mut seen = HashSet::new();
    let mut names = Vec::new();
    let mut add = |name: &str| {
        let trimmed = name.trim();
        if !trimmed.is_empty() && seen.insert(trimmed.to_owned()) {
            names.push(trimmed.to_owned());
        }
    };
    for (name, version) in environment {
        if version
            .as_str()
            .map(str::trim)
            .is_some_and(crate::plus_version::is_plus)
        {
            add(name);
        }
    }
    for name in automatic_placeholder_names(finish)? {
        add(&name);
    }
    for name in manual_package_names(finish)? {
        add(&name);
    }
    Ok(names)
}

fn manual_package_names(finish: &Value) -> io::Result<Vec<String>> {
    let mut names = Vec::new();
    for field in
        finish["manual"].as_array().ok_or_else(|| invalid("dependency pipeline manual policy"))?
    {
        let map = field.as_object().ok_or_else(|| invalid("dependency pipeline manual field"))?;
        for (name, version) in map {
            let trimmed = name.trim();
            if !trimmed.is_empty()
                && version
                    .as_str()
                    .map(str::trim)
                    .is_none_or(|text| !text.is_empty() && text != "-")
            {
                names.push(trimmed.to_owned());
            }
        }
    }
    Ok(names)
}

fn version_request(request: &Request, output: &Value) -> io::Result<versions::Request> {
    let resolution = &request.resolution;
    let policy = &request.initial.policies;
    serde_json::from_value(json!({"entries":output["state"]["entries"],
        "components":output["state"]["components"],"extensions":resolution.extensions,
        "sources":resolution.sources,"grammar":resolution.grammar,
        "policy":{"manual":request.finish["manual"],"envOwn":output["envOwn"],
            "workspace":policy.workspace_policy.dependencies,"automatic":policy.automatic,
            "merge":resolution.merge,"prefix":resolution.prefix}}))
    .map_err(io::Error::other)
}

fn automatic_placeholder_names(finish: &Value) -> io::Result<Vec<String>> {
    let fields = finish["state"]["packages"]
        .as_array()
        .ok_or_else(|| invalid("dependency pipeline packages"))?;
    let mut names = Vec::new();
    for field in fields {
        let map = field.as_object().ok_or_else(|| invalid("dependency pipeline package field"))?;
        names.extend(
            map.iter()
                .filter(|(_, value)| {
                    value
                        .as_str()
                        .map(str::trim)
                        .is_some_and(crate::plus_version::is_plus)
                })
                .map(|(name, _)| name.clone()),
        );
    }
    Ok(names)
}
