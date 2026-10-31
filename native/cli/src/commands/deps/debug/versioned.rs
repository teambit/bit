//! Plain built-in environment versions are rendered from verified model dependencies.

use super::{
    Deps, Failure, ManualPolicy, NODE_DEV, REACT_DEV, REACT_PEER, REACT_RUNTIME,
    WorkspaceDepsContext,
};
use bit_install::{
    model::WorkspaceComponent,
    workspace::{BitmapEntry, ModelData},
};
use serde_json::{Value, json};
use std::{
    collections::{HashMap, HashSet},
    path::Path,
};

pub(super) fn plan(
    root: &Path,
    ctx: &WorkspaceDepsContext,
    entry: &BitmapEntry,
    component: &WorkspaceComponent,
) -> Result<(&'static str, ManualPolicy), Failure> {
    let (env_id, model_manual) = validate(ctx, entry)?;
    let mut manual = super::validate_simple_component(root, ctx, entry, component)?;
    if let Some(saved) = model_manual {
        super::validate_manual_component(root, ctx, entry, component)?;
        if manual.is_empty() {
            manual = saved;
        } else {
            manual = combine_versioned_policies(manual, saved)?;
        }
    }
    Ok((env_id, manual))
}

fn combine_versioned_policies(
    mut bitmap: ManualPolicy,
    mut saved: ManualPolicy,
) -> Result<ManualPolicy, Failure> {
    let mut names = HashMap::new();
    for (lifecycle, rows) in
        [("runtime", &bitmap.runtime), ("dev", &bitmap.dev), ("peer", &bitmap.peer)]
    {
        for (name, version) in rows {
            names.insert(name.clone(), (lifecycle, version.clone()));
        }
    }
    merge_rows(&mut names, "runtime", std::mem::take(&mut saved.runtime), &mut bitmap.runtime)?;
    merge_rows(&mut names, "dev", std::mem::take(&mut saved.dev), &mut bitmap.dev)?;
    merge_rows(&mut names, "peer", std::mem::take(&mut saved.peer), &mut bitmap.peer)?;
    merge_special(&mut bitmap, saved, &names)?;
    Ok(bitmap)
}

fn merge_special(
    bitmap: &mut ManualPolicy,
    saved: ManualPolicy,
    regular: &HashMap<String, (&'static str, String)>,
) -> Result<(), Failure> {
    let mut plus = HashMap::new();
    for (lifecycle, rows) in [
        ("runtime", &bitmap.unresolved_runtime_plus),
        ("dev", &bitmap.unresolved_dev_plus),
        ("peer", &bitmap.unresolved_peer_plus),
    ] {
        for name in rows {
            plus.insert(name.clone(), lifecycle);
        }
    }
    if plus
        .keys()
        .any(|name| regular.contains_key(name))
    {
        return Err(overlapping_policy());
    }
    merge_plus(
        regular,
        &mut plus,
        "runtime",
        saved.unresolved_runtime_plus,
        &mut bitmap.unresolved_runtime_plus,
    )?;
    merge_plus(
        regular,
        &mut plus,
        "dev",
        saved.unresolved_dev_plus,
        &mut bitmap.unresolved_dev_plus,
    )?;
    merge_plus(
        regular,
        &mut plus,
        "peer",
        saved.unresolved_peer_plus,
        &mut bitmap.unresolved_peer_plus,
    )?;
    merge_ignored(bitmap, saved.ignored_names, saved.ignored_env_dependencies, regular, &plus)?;
    Ok(())
}

fn merge_plus(
    regular: &HashMap<String, (&'static str, String)>,
    plus: &mut HashMap<String, &'static str>,
    lifecycle: &'static str,
    rows: Vec<String>,
    target: &mut Vec<String>,
) -> Result<(), Failure> {
    for name in rows {
        if regular.contains_key(&name) {
            return Err(overlapping_policy());
        }
        match plus.get(&name) {
            Some(existing) if *existing == lifecycle => {}
            Some(_) => return Err(overlapping_policy()),
            None => {
                plus.insert(name.clone(), lifecycle);
                target.push(name);
            }
        }
    }
    Ok(())
}

fn merge_ignored(
    bitmap: &mut ManualPolicy,
    saved_names: Vec<String>,
    saved_env: Vec<String>,
    regular: &HashMap<String, (&'static str, String)>,
    plus: &HashMap<String, &'static str>,
) -> Result<(), Failure> {
    let mut seen = bitmap.ignored_names
        .iter()
        .cloned()
        .collect::<HashSet<_>>();
    for name in bitmap.ignored_names.iter().chain(&saved_names) {
        if regular.contains_key(name) || plus.contains_key(name) {
            return Err(overlapping_policy());
        }
    }
    for name in saved_names {
        if seen.insert(name.clone()) {
            bitmap.ignored_names.push(name);
        }
    }
    for name in saved_env {
        if !bitmap.ignored_env_dependencies.contains(&name) {
            bitmap.ignored_env_dependencies.push(name);
        }
    }
    Ok(())
}

fn overlapping_policy() -> Failure {
    Failure::Declined("overlapping versioned deps debug policies delegated".into())
}

fn merge_rows(
    names: &mut HashMap<String, (&'static str, String)>,
    lifecycle: &'static str,
    rows: Vec<(String, String)>,
    target: &mut Vec<(String, String)>,
) -> Result<(), Failure> {
    for (name, version) in rows {
        match names.get(&name) {
            Some((existing_lifecycle, existing_version))
                if *existing_lifecycle == lifecycle && *existing_version == version => {}
            Some(_) => return Err(overlapping_policy()),
            None => {
                names.insert(name.clone(), (lifecycle, version.clone()));
                target.push((name, version));
            }
        }
    }
    Ok(())
}

fn validate(
    ctx: &WorkspaceDepsContext,
    entry: &BitmapEntry,
) -> Result<(&'static str, Option<ManualPolicy>), Failure> {
    let decline = || Failure::Declined("configured versioned deps debug delegated".into());
    let mut id = entry.id.clone();
    if id.scope.is_none() {
        id.scope = id.effective_scope().map(str::to_owned);
    }
    let model = ctx.objects
        .component_or_head(&id)
        .map_err(|_| decline())?
        .ok_or_else(decline)?;
    let env_id = model_env(&model).ok_or_else(decline)?;
    let manual = model_manual_policy(&model, env_id)?;
    if !plain_model(&model, env_id, manual.as_ref()) {
        return Err(decline());
    }
    Ok((env_id, manual))
}

fn model_manual_policy(model: &ModelData, env_id: &str) -> Result<Option<ManualPolicy>, Failure> {
    let decline = || Failure::Declined("configured versioned deps debug delegated".into());
    let resolver = model.extensions
        .iter()
        .find(|extension| {
            crate::commands::update_cmd::matches_aspect(
                extension,
                "teambit.dependencies/dependency-resolver",
            )
        })
        .ok_or_else(decline)?;
    let config = &resolver["config"];
    if config.as_object().is_some_and(serde_json::Map::is_empty) {
        return Ok(None);
    }
    if env_id != "teambit.harmony/node"
        || config.as_object().map(serde_json::Map::len) != Some(2)
        || config["__specific"] != true
    {
        return Err(decline());
    }
    let policy = config["policy"].as_object().ok_or_else(decline)?;
    Ok(Some(super::policy::manual_entries(policy)?))
}

fn model_env(model: &ModelData) -> Option<&'static str> {
    let mut envs = model.extensions
        .iter()
        .filter(|extension| {
            crate::commands::update_cmd::matches_aspect(extension, "teambit.envs/envs")
        });
    let id = envs
        .next()?
        .pointer("/data/id")?
        .as_str()?;
    if envs.next().is_some() {
        return None;
    }
    match bit_install::config::aspect_id_without_version(id) {
        "teambit.harmony/node" => Some("teambit.harmony/node"),
        "teambit.react/react" => Some("teambit.react/react"),
        _ => None,
    }
}

fn plain_model(model: &ModelData, env_id: &str, manual: Option<&ManualPolicy>) -> bool {
    if model.extensions
        .iter()
        .any(|extension| !allowed_config(extension, env_id, manual))
    {
        return false;
    }
    let mut resolver = model.extensions
        .iter()
        .filter(|extension| {
            crate::commands::update_cmd::matches_aspect(
                extension,
                "teambit.dependencies/dependency-resolver",
            )
        });
    let Some(deps) = resolver
        .next()
        .and_then(|extension| extension.pointer("/data/dependencies"))
        .and_then(Value::as_array)
    else {
        return false;
    };
    resolver.next().is_none() && plain_dependencies(deps, env_id, manual)
}

fn allowed_config(extension: &Value, env_id: &str, manual: Option<&ManualPolicy>) -> bool {
    let config = &extension["config"];
    if crate::commands::update_cmd::matches_aspect(
        extension,
        "teambit.dependencies/dependency-resolver",
    ) && manual.is_some()
    {
        return true;
    }
    if env_id == "teambit.react/react"
        && crate::commands::update_cmd::matches_aspect(extension, "teambit.react/react")
    {
        return config == &json!({"__specific": true});
    }
    if env_id == "teambit.react/react"
        && crate::commands::update_cmd::matches_aspect(extension, "teambit.envs/envs")
    {
        let env = config["env"].as_str().map(bit_install::config::aspect_id_without_version);
        return config
            .as_object()
            .is_some_and(|map| map.len() == 2)
            && config["__specific"] == true
            && env == Some(env_id);
    }
    config.as_object().is_some_and(serde_json::Map::is_empty)
}

fn plain_dependencies(deps: &[Value], env_id: &str, manual: Option<&ManualPolicy>) -> bool {
    let expected = if env_id == "teambit.harmony/node" {
        vec![("dev", NODE_DEV)]
    } else {
        vec![("runtime", REACT_RUNTIME), ("dev", REACT_DEV), ("peer", REACT_PEER)]
    };
    let ignored =
        manual.map_or(&[][..], |manual| manual.ignored_env_dependencies.as_slice());
    let expected_count: usize = expected
        .iter()
        .map(|(_, group)| group.len())
        .sum::<usize>()
        - ignored.len()
        + manual.map_or(0, |manual| {
            manual.runtime.len() + manual.dev.len() + manual.peer.len()
        });
    deps.len() == expected_count
        && env_rows_match(deps, &expected, ignored)
        && manual.is_none_or(|manual| manual_rows_match(deps, manual))
}

fn env_rows_match(deps: &[Value], expected: &[(&str, Deps)], ignored: &[String]) -> bool {
    expected
        .iter()
        .all(|(lifecycle, group)| {
            group
                .iter()
                .all(|(name, version)| {
                    ignored
                        .iter()
                        .any(|ignored_name| ignored_name.as_str() == *name)
                        || deps
                            .iter()
                            .any(|dep| {
                                dep.get("id").and_then(Value::as_str) == Some(*name)
                                    && dep.get("version").and_then(Value::as_str) == Some(*version)
                                    && dep.get("__type").and_then(Value::as_str) == Some("package")
                                    && dep.get("lifecycle").and_then(Value::as_str)
                                        == Some(*lifecycle)
                                    && dep.get("source").and_then(Value::as_str) == Some("env")
                                    && dep.get("hidden").and_then(Value::as_bool) == Some(false)
                            })
                })
        })
}

fn manual_rows_match(deps: &[Value], manual: &ManualPolicy) -> bool {
    [("runtime", &manual.runtime), ("dev", &manual.dev), ("peer", &manual.peer)]
        .iter()
        .all(|(lifecycle, group)| {
            group
                .iter()
                .all(|(name, version)| {
                    deps.iter()
                        .any(|dep| {
                            dep.get("id").and_then(Value::as_str) == Some(name.as_str())
                                && dep.get("version").and_then(Value::as_str)
                                    == Some(version.as_str())
                                && dep.get("__type").and_then(Value::as_str) == Some("package")
                                && dep.get("lifecycle").and_then(Value::as_str) == Some(*lifecycle)
                                && (matches!(
                                    dep.get("source").and_then(Value::as_str),
                                    Some("auto" | "config"),
                                ) || *lifecycle == "peer"
                                    && dep.get("source").and_then(Value::as_str) == Some("env")
                                    && dep.get("optional").and_then(Value::as_bool) == Some(false))
                        })
                })
        })
}
