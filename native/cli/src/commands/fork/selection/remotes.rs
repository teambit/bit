use super::{invalid, matched};
use crate::commands::{
    engine::Engine, fork::options::Options, patterns, status::cache::cache_root,
    workspace_command::NodeCli,
};
use serde_json::{Value, json};
use std::{io, path::Path};

pub(super) fn ids(root: &Path, options: &Options) -> io::Result<Vec<String>> {
    let mut result = Vec::new();
    let mut seen = Vec::new();
    for scope in scopes(options) {
        if seen.contains(&scope) {
            continue;
        }
        seen.push(scope.clone());
        let ids = match list(root, &scope) {
            Ok(ids) => ids,
            Err(error) if options.scope_fork => return Err(error),
            Err(_) => continue,
        };
        result.extend(if let Some(pattern) = pattern(options, &scope) {
            matched(&ids, &pattern)?
        } else {
            ids
        });
    }
    Ok(result)
}
fn scopes(options: &Options) -> Vec<String> {
    if options.scope_fork {
        return vec![options.source.trim().to_owned()];
    }
    patterns::split(&options.source)
        .into_iter()
        .filter(|pattern| !pattern.starts_with(['!', '$']))
        .filter_map(|pattern| {
            let (scope, _) = pattern.trim().split_once('/')?;
            let scope = scope.trim();
            (!scope.is_empty() && !scope.contains(['*', '?', '{', '}'])).then(|| scope.to_owned())
        })
        .collect()
}
fn pattern(options: &Options, scope: &str) -> Option<String> {
    if !options.scope_fork {
        return Some(options.source.clone());
    }
    let scope = scope.trim();
    options.pattern
        .as_ref()
        .map(|pattern| {
            patterns::split(pattern)
                .iter()
                .filter_map(|part| qualify_scope_part(part, scope))
                .collect::<Vec<_>>()
                .join(",")
        })
        .filter(|joined| !joined.is_empty())
}
fn qualify_scope_part(part: &str, scope: &str) -> Option<String> {
    let trimmed = part.trim();
    let (prefix, body) = trimmed
        .strip_prefix('!')
        .map_or(("", trimmed), |rest| ("!", rest.trim()));
    if body.is_empty() {
        return None;
    }
    let qualified = if body.starts_with(&format!("{scope}/")) {
        body.to_owned()
    } else {
        format!("{scope}/{body}")
    };
    Some(format!("{prefix}{qualified}"))
}
fn list(root: &Path, scope: &str) -> io::Result<Vec<String>> {
    let cli = NodeCli::find()?;
    let response: Value=Engine::new()?.request(&json!({"kind":"commandInboundList","root":root,"globalConfigDir":cache_root().join("config"),"nodeExecutable":cli.node,"bitDir":cli.bit_dir,"bitVersion":cli.version,"patterns":[format!("{scope}/**")],"laneOnly":false,"forkOrder":true}))?;
    let ids = response["lists"][0]["components"]
        .as_array()
        .ok_or_else(|| invalid("fork remote list"))?
        .iter()
        .map(row_identity)
        .collect::<io::Result<Vec<_>>>()?;
    Ok(ids)
}

fn non_empty_str(val: &Value) -> Option<&str> {
    val.as_str()
        .map(str::trim)
        .filter(|text| !text.is_empty())
}

fn row_identity(row: &Value) -> io::Result<String> {
    if let Some(id) = non_empty_str(&row["id"]).or_else(|| non_empty_str(&row["identity"])) {
        return Ok(id.to_owned());
    }
    let name = non_empty_str(&row["id"]["name"])
        .or_else(|| non_empty_str(&row["name"]))
        .ok_or_else(|| invalid("fork remote identity"))?;
    Ok(non_empty_str(&row["id"]["scope"])
        .or_else(|| non_empty_str(&row["scope"]))
        .map_or_else(|| name.to_owned(), |scope| format!("{scope}/{name}")))
}
