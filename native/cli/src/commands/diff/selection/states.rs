//! `ScopeMain.filterIdsFromPoolIdsByPattern` and workspace state filters.

use crate::commands::{
    engine::Engine,
    patterns,
    status::{
        capture::Capture,
        js::{decline, text, truthy, without_version},
    },
};
use serde_json::{Value, json};
use std::{collections::HashSet, io, path::Path};

pub(in crate::commands::diff) fn after_capture(
    engine: &mut Engine,
    root: &Path,
    context: &Value,
    targets: &[Value],
    pattern: Option<&str>,
    capture: &mut Capture,
) -> io::Result<(Vec<Value>, Vec<usize>)> {
    let Some(pattern) = pattern.filter(|pattern| super::stateful(pattern)) else {
        return Ok((targets.to_vec(), Vec::new()));
    };
    let (selected, loads) = select_capture(engine, root, context, targets, pattern, capture)?;
    retain_capture(capture, &selected);
    Ok((selected, loads))
}

/// Evaluate workspace predicates without removing candidates needed by write cascades.
pub(in crate::commands) fn select_capture(
    engine: &mut Engine,
    root: &Path,
    context: &Value,
    targets: &[Value],
    pattern: &str,
    capture: &Capture,
) -> io::Result<(Vec<Value>, Vec<usize>)> {
    let compared: Value =
        engine.request(&json!({"kind":"statusCompare","root":root,"targets":capture.comparisons}))?;
    let state = State {
        context,
        captured: &capture.captured,
        environment_facts: &capture.environment_facts,
        compared: &compared,
    };
    select_states(&state, targets, pattern)
}

/// Apply one workspace criterion after its caller has performed the canonical load phase.
pub(in crate::commands) fn criterion(
    context: &Value,
    targets: Vec<Value>,
    entered: &str,
    captured: &[Value],
    environment_facts: &Value,
    compared: &Value,
) -> io::Result<Vec<Value>> {
    State { context, captured, environment_facts, compared }.filter(targets, entered)
}

fn select_states(
    state: &State<'_>,
    targets: &[Value],
    pattern: &str,
) -> io::Result<(Vec<Value>, Vec<usize>)> {
    let parts = patterns::split(pattern);
    let mut selected = ordinary(targets, &parts)?;
    let mut loads = Vec::new();
    for part in parts
        .iter()
        .filter(|part| part.starts_with('$') || part.contains(" AND "))
    {
        let (matched, loading) = state.intersection(targets, part)?;
        loads.extend(loading);
        for target in matched {
            if !selected
                .iter()
                .any(|known| known["identity"] == target["identity"])
            {
                selected.push(target);
            }
        }
    }
    if selected.is_empty() {
        return Err(decline("diff state pattern has no matches"));
    }
    Ok((selected, loads))
}

fn retain_capture(capture: &mut Capture, selected: &[Value]) {
    let ids: HashSet<_> = selected
        .iter()
        .filter_map(|target| target["identity"].as_str().map(str::trim))
        .collect();
    capture.captured.retain(|row| {
        row["identity"]
            .as_str()
            .map(str::trim)
            .is_some_and(|id| ids.contains(id))
    });
    capture.comparisons.retain(|row| {
        row["identity"]
            .as_str()
            .map(str::trim)
            .is_some_and(|id| ids.contains(id))
    });
}

fn ordinary(targets: &[Value], parts: &[String]) -> io::Result<Vec<Value>> {
    let ids = targets
        .iter()
        .map(|target| text(target.get("identity")))
        .collect::<io::Result<Vec<_>>>()?;
    let globs = parts
        .iter()
        .filter(|part| !part.starts_with('$') && !part.contains(" AND "))
        .cloned()
        .collect::<Vec<_>>();
    let matched = patterns::extended::matching(&ids, &globs)?;
    Ok(matched
        .iter()
        .filter_map(|id| {
            targets
                .iter()
                .find(|target| target["identity"] == *id)
        })
        .cloned()
        .collect())
}

struct State<'a> {
    context: &'a Value,
    captured: &'a [Value],
    environment_facts: &'a Value,
    compared: &'a Value,
}
impl State<'_> {
    fn intersection(&self, targets: &[Value], part: &str) -> io::Result<(Vec<Value>, Vec<usize>)> {
        let mut selected = targets.to_vec();
        let mut loads = Vec::new();
        for criterion in part.split(" AND ").map(str::trim) {
            if !selected.is_empty() && requires_loading(criterion) {
                loads.push(selected.len());
            }
            selected = self.filter(selected, criterion)?;
        }
        Ok((selected, loads))
    }

    fn filter(&self, targets: Vec<Value>, criterion: &str) -> io::Result<Vec<Value>> {
        targets
            .into_iter()
            .filter_map(|target| {
                let result = match criterion.strip_prefix('$') {
                    Some(state) => self.matches(&target, state),
                    None => legacy_pattern(&target, criterion),
                };
                match result {
                    Ok(true) => Some(Ok(target)),
                    Ok(false) => None,
                    Err(error) => Some(Err(error)),
                }
            })
            .collect()
    }

    fn matches(&self, target: &Value, state: &str) -> io::Result<bool> {
        let id = text(target.get("identity"))?;
        if let Some(env) = state.strip_prefix("env:") {
            return self.environment(target, env);
        }
        Ok(match state {
            "new" => !truthy(target.get("version")),
            "modified" => self.comparison(id, "modified"),
            "codeModified" => self.comparison(id, "codeModified"),
            "localOnly" => target["localOnly"] == true,
            "softTagged" => target["softTagged"] == true,
            "deleted" => {
                target["locallyRemoved"] == true
                    || self.current(id, "teambit.component/remove")["removed"] == true
            }
            "deprecated" => {
                self.model(target)
                    .is_some_and(|model| truthy(model.get("deprecated")))
                    || self.head(target, "teambit.component/deprecation")["deprecate"] == true
            }
            "internal" => self.internal(target),
            "snappedOnMain" => self.snapped(target),
            _ => return Err(decline("unrecognized component state selector")),
        })
    }

    fn comparison(&self, id: &str, field: &str) -> bool {
        let id = id.trim();
        self.compared["comparisons"]
            .as_array()
            .into_iter()
            .flatten()
            .any(|row| {
                row["identity"]
                    .as_str()
                    .is_some_and(|cand| cand.trim() == id)
                    && row[field] == true
            })
    }

    fn current(&self, id: &str, aspect: &str) -> Value {
        let id = id.trim();
        self.captured
            .iter()
            .find(|row| {
                row["identity"]
                    .as_str()
                    .is_some_and(|cand| cand.trim() == id)
            })
            .and_then(|row| row["current"]["extensions"].as_array())
            .and_then(|rows| {
                rows.iter().find(|row| crate::commands::update_cmd::matches_aspect(row, aspect))
            })
            .map_or(Value::Null, |row| row["config"].clone())
    }

    fn model<'a>(&'a self, target: &Value) -> Option<&'a Value> {
        let target_id = target["identity"]
            .as_str()
            .map(str::trim)
            .unwrap_or_default();
        self.context["models"]
            .as_array()?
            .iter()
            .find(|model| {
                format!(
                    "{}/{}",
                    model["scope"]
                        .as_str()
                        .map(str::trim)
                        .unwrap_or_default(),
                    model["name"]
                        .as_str()
                        .map(str::trim)
                        .unwrap_or_default(),
                ) == target_id
            })
    }

    fn head(&self, target: &Value, aspect: &str) -> Value {
        let Some(model) = self.model(target) else { return Value::Null };
        let id = target["identity"].as_str().unwrap_or_default();
        let head = self.context["laneHeads"]
            .get(id)
            .unwrap_or_else(|| &model["head"]);
        self.context["versions"]
            .as_array()
            .into_iter()
            .flatten()
            .find(|row| &row[0] == head)
            .and_then(|row| row[1]["extensions"].as_array())
            .and_then(|rows| {
                rows.iter().find(|row| crate::commands::update_cmd::matches_aspect(row, aspect))
            })
            .map_or(Value::Null, |row| row["config"].clone())
    }

    fn internal(&self, target: &Value) -> bool {
        let aspect = "teambit.component/internalize";
        crate::commands::update_cmd::aspect_entry(&target["componentConfig"], aspect)
            .and_then(|(_, val)| val["internal"].as_bool())
            .unwrap_or_else(|| self.head(target, aspect)["internal"] == true)
    }

    fn snapped(&self, target: &Value) -> bool {
        if !self.context["currentLaneId"]
            .as_str()
            .is_some_and(|id| id.ends_with("/main"))
            || target["localOnly"] == true
        {
            return false;
        }
        let Some(model) = self.model(target) else { return false };
        let id = target["identity"].as_str().unwrap_or_default();
        let merging = self.context["unmerged"]
            .as_array()
            .into_iter()
            .flatten()
            .any(|row| {
                crate::commands::version_history::build::row_scope_and_name(row)
                    .is_some_and(|(scope, name)| format!("{scope}/{name}") == id)
            });
        !merging
            && model["head"].is_string()
            && !model["versions"]
                .as_object()
                .into_iter()
                .chain(model["orphanedVersions"].as_object())
                .flat_map(|versions| versions.values())
                .any(|hash| hash == &model["head"])
    }

    fn environment(&self, target: &Value, requested: &str) -> io::Result<bool> {
        let projected = crate::commands::status::policy::environment_target(self.context, target)?;
        let config = &projected["config"]["extensions"];
        let identity = text(target.get("identity"))?;
        let env = self.environment_facts[identity]["envId"]
            .as_str()
            .or_else(|| {
                crate::commands::update_cmd::aspect_entry(config, "teambit.envs/envs")
                    .and_then(|(_, val)| val["env"].as_str())
            })
            .unwrap_or("teambit.harmony/node");
        let resolved = config
            .as_object()
            .and_then(|config| {
                config
                    .keys()
                    .find(|id| without_version(id) == without_version(env))
            })
            .map_or(env, String::as_str);
        Ok(resolved == requested || without_version(resolved) == requested)
    }
}

fn legacy_pattern(target: &Value, pattern: &str) -> io::Result<bool> {
    let identity = text(target.get("identity"))?;
    let legacy = if target["scoped"] == true {
        identity
    } else {
        identity.split_once('/').map_or(identity, |(_, name)| name)
    };
    Ok(!patterns::extended::matching(&[legacy, identity], &[pattern.to_string()])?.is_empty())
}

fn requires_loading(criterion: &str) -> bool {
    matches!(criterion, "$modified" | "$deprecated" | "$deleted") || criterion.starts_with("$env:")
}
