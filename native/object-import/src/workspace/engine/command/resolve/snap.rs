//! Ordinary snapshot selection uses the retained current Source/metadata comparison.
use super::{
    super::{capture, invalid, repository},
    Options, Retained, selection,
};
use crate::workspace::engine::status_models::{comparison, versions};
use serde_json::Value;
use std::{collections::HashSet, io};

pub(super) fn select(
    retained: &mut Retained,
    captured: &[capture::Captured],
    pattern: Option<&[String]>,
) -> io::Result<Vec<String>> {
    let options = retained.snap
        .as_ref()
        .ok_or_else(|| invalid("snap options absent"))?
        .clone();
    if options.unmerged {
        // Canonical snap --unmerged ignores the ordinary pattern selector.
        return selection::select(&retained.record.targets, &retained.pending, None);
    }
    if options.pattern.is_some() != pattern.is_some() {
        return Err(invalid("snap pattern receipt presence"));
    }
    let candidates = candidates(retained, captured, &options)?;
    let Some(pattern) = pattern else { return Ok(candidates) };
    if candidates.is_empty() {
        return Ok(Vec::new());
    }
    let known: Vec<_> = captured
        .iter()
        .map(|current| current.target.identity.clone())
        .collect();
    filter_pattern(candidates, &known, pattern, &options)
}

pub(super) fn candidates(
    retained: &mut Retained,
    captured: &[capture::Captured],
    options: &Options,
) -> io::Result<Vec<String>> {
    let mut rows = Vec::new();
    for current in captured {
        if !local_only(retained, &current.target.identity) && eligible(retained, current, options)?
        {
            rows.push(current);
        }
    }
    if !options.unmodified {
        // ComponentsList emits new IDs before modified IDs; scalar allocation follows this order.
        rows.sort_by_key(|current| !current.target.version.is_empty());
    }
    let mut candidates: Vec<_> = rows
        .into_iter()
        .map(|current| current.target.identity.clone())
        .collect();
    append_pending(retained, captured, &mut candidates)?;
    Ok(candidates)
}

fn append_pending(
    retained: &Retained,
    captured: &[capture::Captured],
    candidates: &mut Vec<String>,
) -> io::Result<()> {
    for pending in &retained.pending {
        let identity = selection::identity(&pending["id"])?;
        if !captured
            .iter()
            .any(|current| current.target.identity == identity)
        {
            return Err(invalid("snap pending target outside capture"));
        }
        if !local_only(retained, &identity) && !candidates.contains(&identity) {
            candidates.push(identity);
        }
    }
    Ok(())
}

fn filter_pattern(
    candidates: Vec<String>,
    known: &[String],
    pattern: &[String],
    options: &Options,
) -> io::Result<Vec<String>> {
    let seen = pattern_set(known, pattern)?;
    let exact = options.pattern
        .as_deref()
        .is_some_and(|pattern| !pattern.contains('*') && !pattern.contains(','));
    if exact
        && (pattern.len() != 1
            || !options.pattern
                .as_deref()
                .unwrap()
                .bytes()
                .all(|byte| byte.is_ascii_alphanumeric() || b"_./-".contains(&byte)))
    {
        return Err(invalid("snap exact identity requires canonical resolution"));
    }
    let selected = if exact {
        pattern.to_vec()
    } else {
        candidates
            .into_iter()
            .filter(|identity| seen.contains(identity))
            .collect()
    };
    if selected.is_empty() {
        return Err(invalid("snap pattern excludes all modified and new components"));
    }
    Ok(selected)
}

fn pattern_set<'a>(known: &[String], pattern: &'a [String]) -> io::Result<HashSet<&'a String>> {
    let mut seen = HashSet::new();
    for identity in pattern {
        if !seen.insert(identity) || !known.contains(identity) {
            return Err(invalid("snap pattern identity"));
        }
    }
    Ok(seen)
}

pub(super) fn eligible(
    retained: &mut Retained,
    current: &capture::Captured,
    options: &Options,
) -> io::Result<bool> {
    let model = repository::model(&retained.record.context, &current.target.identity)?;
    let Some(model) = model else { return Ok(true) };
    if options.unmodified {
        return Ok(true);
    }
    let reference = versions::reference(&model, &current.target.version)?;
    let stored = retained.record.repository.read(&reference, "Version")?;
    Ok(comparison::compare(&current.target, &current.metadata, &stored)?["modified"] == true)
}

pub(super) fn report(
    retained: &Retained,
    selected: &[String],
    materials: &[super::super::resolve_snapshot::Material],
    automatic: &[Value],
) -> io::Result<Value> {
    let lane = retained.record.context
        .get("lane")
        .and_then(|lane| lane.get("currentId"));
    let lane_name = lane.map(|id| {
        format!(
            "{}/{}",
            id["scope"].as_str().unwrap_or_default(),
            id["name"].as_str().unwrap_or_default(),
        )
    });
    Ok(
        serde_json::json!({"snappedComponents":selected,"newComponents":materials.iter().filter(|material| material.version_state.current_head.is_empty() && material.participation.selected).map(|material|material.identity.clone()).collect::<Vec<_>>(),"removedComponents":materials.iter().filter(|material| !material.hidden && material.participation.selected && super::super::resolve_snapshot::is_removed(&material.version)).map(|material|material.identity.clone()).collect::<Vec<_>>(),"autoSnappedResults":automatic,"laneName":lane_name,"totalComponentsCount":materials.len()}),
    )
}

pub(super) fn hidden_reports(
    materials: &[super::super::resolve_snapshot::Material],
) -> io::Result<Vec<Value>> {
    materials
        .iter()
        .filter(|material| material.hidden && !material.participation.selected)
        .map(|material| {
            let triggered: Vec<_> = materials
                .iter()
                .filter(|seed| {
                    seed.participation.selected
                        && super::hidden::depends_on(
                            &material.version,
                            &seed.identity,
                            &seed.version_state.current_head,
                        )
                })
                .map(|seed| format!("{}@{}", seed.identity, seed.version_state.current_head))
                .collect();
            if triggered.is_empty() {
                return Err(invalid("snap hidden trigger absent"));
            }
            Ok(serde_json::json!({"id":material.identity,"triggeredBy":triggered}))
        })
        .collect()
}

pub(super) fn prepare_graph_imports(
    retained: &mut Retained,
    materials: &[super::super::resolve_snapshot::Material],
) -> io::Result<()> {
    let mut known =
        if retained.snap.as_ref().is_some_and(|options| options.policy.rebuild_deps_graph) {
            HashSet::new()
        } else {
            known_previous(materials, &mut retained.record.repository)?
        };
    let mut targets = Vec::new();
    for material in materials {
        let source = serde_json::json!({"scope":material.model["scope"],"name":material.model["name"],"version":material.version_state.current_head});
        for edge in super::graph::edges(&source, &material.version)? {
            let id = &edge["target"];
            let identity = selection::identity(id)?;
            if materials
                .iter()
                .any(|material| material.identity == identity)
                || !known.insert(id_key(id)?)
            {
                continue;
            }
            targets.push(crate::command_import::Target {
                scope: id["scope"].as_str().map(str::to_owned),
                name: id["name"]
                    .as_str()
                    .ok_or_else(|| invalid("snap dependency name"))?
                    .to_owned(),
                version: id["version"]
                    .as_str()
                    .ok_or_else(|| invalid("snap dependency version"))?
                    .to_owned(),
            });
        }
    }
    retained.record.repository.prepare_versions(&targets)
}

fn known_previous(
    materials: &[super::super::resolve_snapshot::Material],
    repository: &mut repository::Repository,
) -> io::Result<HashSet<String>> {
    let mut known = HashSet::new();
    for material in materials
        .iter()
        .filter(|material| !material.version_state.current_head.is_empty())
    {
        let previous = repository.read(&material.version_state.current_head, "Version")?;
        let edges = if let Some(reference) = previous["flattenedEdgesRef"].as_str() {
            repository.source_json(reference)?
        } else {
            previous["flattenedEdges"].clone()
        };
        if edges
            .as_array()
            .is_some_and(|rows| !rows.is_empty())
        {
            let previous = crate::workspace::engine::status_models::harmony::project(&previous)?;
            for id in previous["flattenedDependencies"]
                .as_array()
                .ok_or_else(|| invalid("snap prior flattened dependencies"))?
            {
                known.insert(id_key(id)?);
            }
        }
    }
    Ok(known)
}

fn id_key(id: &Value) -> io::Result<String> {
    Ok(format!(
        "{}@{}",
        selection::identity(id)?,
        id["version"].as_str().ok_or_else(|| invalid("snap dependency version"))?,
    ))
}

pub(super) fn new_material(
    retained: &mut Retained,
    current: &capture::Captured,
    receipt: &super::projection::Component,
    participation: super::super::resolve_snapshot::Participation,
) -> io::Result<super::super::resolve_snapshot::Material> {
    let identity = &current.target.identity;
    let hash = crate::workspace::engine::hash(identity.as_bytes());
    match retained.record.repository.read(&hash, "Component") {
        Err(error) if error.kind() == io::ErrorKind::NotFound => {}
        Err(error) => return Err(error),
        Ok(_) => return Err(invalid("snap new component appeared")),
    }
    let (scope, name) =
        identity.split_once('/').ok_or_else(|| invalid("snap new scoped identity"))?;
    let binding = current.target.current["bindingPrefix"]
        .as_str()
        .filter(|value| !value.is_empty())
        .ok_or_else(|| invalid("snap new binding prefix"))?;
    // ModelComponent.from(getPropsFromConsumerComp) for a newly tracked Harmony component.
    let model = serde_json::json!({"name":name,"scope":scope,"versions":{},"lang":"javascript","deprecated":false,"bindingPrefix":binding,"remotes":[],"schema":"2.0.0"});
    let stored = serde_json::json!({"schema":"2.0.0","extensions":[]});
    let version =
        super::projection::version(&stored, &current.target.current, &current.metadata, receipt)?;
    Ok(super::super::resolve_snapshot::Material {
        identity: identity.clone(),
        model,
        version,
        files: current.files
            .as_array()
            .ok_or_else(|| invalid("snap new files"))?
            .clone(),
        version_state: super::super::resolve_snapshot::VersionState {
            current_head: String::new(),
            tagged_version: None,
        },
        pending: None,
        hidden: false,
        participation,
    })
}

#[cfg(test)]
mod tests;

pub(super) fn local_only(retained: &Retained, identity: &str) -> bool {
    retained.record.targets
        .iter()
        .any(|target| target["identity"] == identity && target["localOnly"] == true)
}
