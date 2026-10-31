mod membership;
mod remotes;
use super::{inventory, options::Options};
use crate::commands::patterns;
use serde_json::Value;
use std::{io, path::Path};
pub(super) struct Selected {
    pub local: Vec<String>,
    pub remote: Vec<String>,
    pub target_scope: String,
}
pub(super) fn select(root: &Path, options: &Options, state: &Value) -> io::Result<Selected> {
    let scope = options.scope
        .as_deref()
        .map(str::trim)
        .filter(|scope| !scope.is_empty())
        .map_or_else(|| inventory::default_scope(state), |scope| Ok(scope.to_owned()))?;
    if !options.multiple() {
        return Ok(single(options, state, scope));
    }
    if options.target.is_some() {
        return Err(invalid("target-component-name is not allowed when using patterns"));
    }
    let pool = state["components"].as_array().ok_or_else(|| invalid("fork workspace inventory"))?;
    let local = local_matches(options, pool)?;
    let remote = remotes::ids(root, options)?;
    require_matches(options, &local, &remote)?;
    if options.scope_fork {
        return scope_selection(local, remote, scope, pool);
    }
    let local = without_existing_targets(local, &scope, pool);
    let remote = without_existing_targets(remote, &scope, pool);
    let (local, remote) = membership::classify(&local, &remote, pool);
    let selected = Selected { local, remote, target_scope: scope };
    require_new_targets(options, &selected)?;
    Ok(selected)
}
fn single(options: &Options, state: &Value, scope: String) -> Selected {
    let local = inventory::selected(state, &options.source)
        .and_then(|row| {
            row["identity"]
                .as_str()
                .or_else(|| row["id"].as_str())
                .map(str::to_owned)
        });
    Selected {
        local: local.iter().cloned().collect(),
        remote: if local.is_none() { vec![options.source.clone()] } else { vec![] },
        target_scope: scope,
    }
}
fn local_matches(options: &Options, pool: &[Value]) -> io::Result<Vec<String>> {
    if options.scope_fork {
        return Ok(vec![]);
    }
    let ids = pool
        .iter()
        .filter_map(|row| {
            row["identity"]
                .as_str()
                .or_else(|| row["id"].as_str())
                .map(str::to_owned)
        })
        .collect::<Vec<_>>();
    matched(&ids, &options.source)
}
fn require_matches(options: &Options, local: &[String], remote: &[String]) -> io::Result<()> {
    if !local.is_empty() || !remote.is_empty() {
        return Ok(());
    }
    Err(invalid(if options.scope_fork {
        format!("unable to find components to fork from {}", options.source)
    } else {
        format!(r#"no components found matching pattern "{}""#, options.source)
    }))
}
fn without_existing_targets(ids: Vec<String>, scope: &str, pool: &[Value]) -> Vec<String> {
    ids.into_iter()
        .filter(|id| {
            let name = bare(id).split_once('/').map_or_else(|| bare(id), |(_, name)| name);
            let target = format!("{scope}/{name}");
            !pool
                .iter()
                .any(|row| row_bare_id(row) == Some(target.as_str()))
        })
        .collect()
}
fn require_new_targets(options: &Options, selected: &Selected) -> io::Result<()> {
    if selected.local.is_empty() && selected.remote.is_empty() {
        return Err(invalid(format!(
            r#"all components matching pattern "{}" already exist in the workspace with scope "{}""#,
            options.source, selected.target_scope,
        )));
    }
    Ok(())
}
fn scope_selection(
    local: Vec<String>,
    remote: Vec<String>,
    scope: String,
    pool: &[Value],
) -> io::Result<Selected> {
    for id in &remote {
        if let Some(existing) = pool
            .iter()
            .find(|row| row_bare_id(row) == Some(bare(id)))
        {
            let version = existing["version"]
                .as_str()
                .map(str::trim)
                .filter(|version| !version.is_empty())
                .map(|version| format!("@{version}"))
                .unwrap_or_default();
            return Err(invalid(format!(
                r#"unable to fork "{id}". the workspace has a component "{}{version}" with the same name and same scope"#,
                bare(id),
            )));
        }
    }
    Ok(Selected { local, remote, target_scope: scope })
}
fn matched(ids: &[String], pattern: &str) -> io::Result<Vec<String>> {
    let patterns = patterns::split(pattern);
    let mut result = Vec::new();
    for id in ids {
        let full = bare(id);
        let name = full.split_once('/').map_or(full, |(_, name)| name);
        let mut selected = false;
        for pattern in &patterns {
            let (negated, glob) = pattern
                .strip_prefix('!')
                .map_or((false, pattern.as_str()), |glob| (true, glob));
            if !patterns::matching(&[full, name], &[glob.to_owned()])?.is_empty() {
                selected = !negated;
            }
        }
        if selected {
            result.push(id.clone());
        }
    }
    Ok(result)
}
fn row_bare_id(row: &Value) -> Option<&str> {
    row["identity"]
        .as_str()
        .map(str::trim)
        .filter(|id| !id.is_empty())
        .or_else(|| {
            row["id"]
                .as_str()
                .map(str::trim)
                .filter(|id| !id.is_empty())
        })
        .map(bare)
}
fn bare(id: &str) -> &str {
    let trimmed = id.trim();
    match trimmed.rsplit_once('@') {
        Some((prefix, _)) if !prefix.is_empty() => prefix.trim(),
        _ => trimmed,
    }
}
fn invalid(message: impl Into<String>) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidInput, message.into())
}
