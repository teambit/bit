//! Canonical post-status lane filtering. Glob matching is a bounded grammar
//! receipt; dependency ancestry, import decisions and excluded rows stay native.
use super::{history, input::Prepare, invalid, repository::Repository};
use serde_json::{Value, json};
use std::{collections::HashSet, io};

#[cfg(test)]
mod tests;

struct Inputs<'a> {
    request: &'a Prepare,
    context: &'a Value,
    statuses: &'a [Value],
}

pub(super) struct Filtered {
    pub(super) indices: Vec<usize>,
    pub(super) excluded: Vec<Value>,
}

pub(super) fn filter(
    request: &Prepare,
    context: &Value,
    statuses: &[Value],
    pattern: Option<&[String]>,
    repository: &mut Repository,
    history: &mut history::State,
) -> io::Result<Filtered> {
    let options = request.options.lane.as_ref().ok_or_else(|| invalid("lane filter options"))?;
    if statuses.len() > 4096 {
        return Err(invalid("lane filter count"));
    }
    let input = Inputs { request, context, statuses };
    let mut indices = (0..statuses.len()).collect::<Vec<_>>();
    let mut excluded = vec![None; statuses.len()];
    if request.options.pattern.is_some() != pattern.is_some() {
        return Err(invalid("lane pattern grammar receipt"));
    }
    if let Some(pattern) = pattern {
        let keep = indices_for_ids(statuses, pattern)?;
        if keep.is_empty() {
            return Err(invalid("lane pattern matched no components"));
        }
        indices = phase(&input, &keep, &mut excluded, "excluded by pattern", repository, history)?;
    }
    if options.workspace_only {
        let ids = workspace_ids(context, statuses)?;
        let keep = indices_for_ids(statuses, &ids)?;
        indices = phase(&input, &keep, &mut excluded, "not in the workspace", repository, history)?;
    }
    let excluded = indices.iter().filter_map(|index| excluded[*index].as_ref().map(|message| {
        json!({"index":index,"identity":statuses[*index]["identity"],"head":statuses[*index]["targetHead"],"message":message})
    })).collect();
    Ok(Filtered { indices, excluded })
}

fn indices_for_ids(statuses: &[Value], ids: &[String]) -> io::Result<Vec<usize>> {
    let mut seen = HashSet::new();
    ids.iter()
        .map(|id| {
            if !seen.insert(id) {
                return Err(invalid("lane duplicate pattern identity"));
            }
            statuses
                .iter()
                .position(|row| row["identity"] == *id)
                .ok_or_else(|| invalid("lane pattern unknown identity"))
        })
        .collect()
}

fn workspace_ids(context: &Value, statuses: &[Value]) -> io::Result<Vec<String>> {
    Ok(context["targets"]
        .as_array()
        .ok_or_else(|| invalid("lane workspace identities"))?
        .iter()
        .filter_map(|row| row["identity"].as_str())
        .filter(|id| {
            statuses
                .iter()
                .any(|row| row["identity"] == *id)
        })
        .map(str::to_owned)
        .collect())
}
fn phase(
    input: &Inputs<'_>,
    keep: &[usize],
    excluded: &mut [Option<String>],
    message: &str,
    repository: &mut Repository,
    history: &mut history::State,
) -> io::Result<Vec<usize>> {
    let mut selected = keep.to_vec();
    if !input.context["lane"]["other"].is_null() {
        let checks = versions_to_check(input.context, input.statuses, keep, excluded)?;
        repository.prepare_lane_pattern_versions(&import_targets(input.statuses, &checks)?)?;
        for (_, versions) in checks {
            for version in versions {
                extend_dependencies(input, &version, keep, &mut selected, repository, history)?;
            }
        }
    }
    for (index, row) in excluded.iter_mut().enumerate() {
        if !selected.contains(&index) {
            *row = Some(message.to_owned());
            selected.push(index);
        }
    }
    Ok(selected)
}
fn import_targets(
    statuses: &[Value],
    checks: &[(usize, Vec<String>)],
) -> io::Result<Vec<crate::command_import::Target>> {
    checks
        .iter()
        .flat_map(|(index, versions)| {
            versions
                .iter()
                .map(move |version| (*index, version))
        })
        .map(|(index, version)| {
            let identity = text(&statuses[index], "identity")?;
            let (scope, name) =
                identity.split_once('/').ok_or_else(|| invalid("lane filter component scope"))?;
            Ok(crate::command_import::Target {
                scope: Some(scope.into()),
                name: name.into(),
                version: version.clone(),
            })
        })
        .collect()
}
fn extend_dependencies(
    input: &Inputs<'_>,
    version: &str,
    keep: &[usize],
    selected: &mut Vec<usize>,
    repository: &mut Repository,
    history: &mut history::State,
) -> io::Result<()> {
    let value = crate::workspace::engine::status_models::harmony::project(&repository.read(
        version, "Version",
    )?)?;
    for dependency in value["flattenedDependencies"]
        .as_array()
        .ok_or_else(|| invalid("lane filter flattened dependencies"))?
    {
        let id = format!("{}/{}", text(dependency, "scope")?, text(dependency, "name")?);
        let Some(other) = input.statuses
            .iter()
            .position(|row| row["identity"] == id)
        else {
            continue;
        };
        if keep.contains(&other)
            || !on_lane(input.request, input.context, dependency, repository, history)?
        {
            continue;
        }
        if !input.request.options.lane.as_ref().unwrap().include_deps {
            return Err(invalid("lane filter excludes a required lane dependency"));
        }
        if !selected.contains(&other) {
            selected.push(other);
        }
    }
    Ok(())
}

fn versions_to_check(
    context: &Value,
    statuses: &[Value],
    keep: &[usize],
    excluded: &[Option<String>],
) -> io::Result<Vec<(usize, Vec<String>)>> {
    keep.iter()
        .filter(|index| excluded[**index].is_none() && statuses[**index]["unchanged"] != true)
        .map(|index| {
            let versions = check_versions(context, &statuses[*index])?;
            Ok((*index, versions))
        })
        .collect()
}

fn check_versions(context: &Value, row: &Value) -> io::Result<Vec<String>> {
    let values = row["distance"]["targetOnly"]
        .as_array()
        .ok_or_else(|| invalid("lane filter target history"))?;
    if values.is_empty() {
        return Ok(Vec::new());
    }
    if context["lane"]["shouldSquash"] == true {
        return Ok(vec![text(row, "targetHead")?.to_owned()]);
    }
    values
        .iter()
        .map(|value| {
            value
                .as_str()
                .map(str::to_owned)
                .ok_or_else(|| invalid("lane filter history hash"))
        })
        .collect()
}

fn on_lane(
    request: &Prepare,
    context: &Value,
    dependency: &Value,
    repository: &mut Repository,
    history: &mut history::State,
) -> io::Result<bool> {
    let identity = format!("{}/{}", text(dependency, "scope")?, text(dependency, "name")?);
    let model = repository.read(&crate::workspace::engine::hash(identity.as_bytes()), "Component")?;
    let Some(main) = model["head"].as_str() else { return Ok(true) };
    let version = text(dependency, "version")?;
    if main == version || crate::merge_history::hash(version).is_err() {
        return Ok(false);
    }
    let lane = &context["lane"]["other"]["value"];
    let Some(entry) = lane["components"]
        .as_array()
        .and_then(|rows| {
            rows.iter()
                .find(|row| {
                    row["id"]["scope"] == dependency["scope"]
                        && row["id"]["name"] == dependency["name"]
                })
        })
    else {
        return Ok(false);
    };
    let head = text(entry, "head")?;
    if head == version {
        return Ok(true);
    }
    let distance =
        history.distance(&request.root, &identity, &model, [Some(head), Some(main)], repository)?;
    if distance["noCommon"] == true {
        return Err(invalid("lane dependency unrelated history"));
    }
    Ok(distance["sourceOnly"]
        .as_array()
        .is_some_and(|rows| rows.iter().any(|row| row == version)))
}
fn text<'a>(value: &'a Value, key: &str) -> io::Result<&'a str> {
    value[key].as_str().ok_or_else(|| invalid("lane filter text"))
}
