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
        return vec![options.source.clone()];
    }
    patterns::split(&options.source)
        .into_iter()
        .filter(|pattern| !pattern.starts_with(['!', '$']))
        .filter_map(|pattern| {
            let scope = pattern.split('/').next()?;
            (!scope.is_empty() && !scope.contains('*')).then(|| scope.to_owned())
        })
        .collect()
}
fn pattern(options: &Options, scope: &str) -> Option<String> {
    if !options.scope_fork {
        return Some(options.source.clone());
    }
    options.pattern
        .as_ref()
        .map(|pattern| {
            patterns::split(pattern)
                .iter()
                .map(|part| {
                    if part.starts_with(&format!("{scope}/")) {
                        part.clone()
                    } else {
                        format!("{scope}/{part}")
                    }
                })
                .collect::<Vec<_>>()
                .join(",")
        })
}
fn list(root: &Path, scope: &str) -> io::Result<Vec<String>> {
    let cli = NodeCli::find()?;
    let response: Value=Engine::new()?.request(&json!({"kind":"commandInboundList","root":root,"globalConfigDir":cache_root().join("config"),"nodeExecutable":cli.node,"bitDir":cli.bit_dir,"bitVersion":cli.version,"patterns":[format!("{scope}/**")],"laneOnly":false,"forkOrder":true}))?;
    let ids = response["lists"][0]["components"]
        .as_array()
        .ok_or_else(|| invalid("fork remote list"))?
        .iter()
        .map(|row| {
            row["id"]
                .as_str()
                .map(str::to_owned)
                .ok_or_else(|| invalid("fork remote identity"))
        })
        .collect::<io::Result<Vec<_>>>()?;
    Ok(ids)
}
