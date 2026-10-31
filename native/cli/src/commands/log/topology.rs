//! The ordering of `cleargraph.toposort()` for component Version parents
//! and local workspace/scope component resolution for `bit log`.

use super::{Chalk, array, bitmap, decline, text};
use crate::{
    commands::scope_set::{
        Failure,
        selection::{validate_component_name, validate_scope_name},
    },
    workspace,
};
use serde_json::Value;
use std::{collections::HashMap, env, fs, io, path::Path};

#[derive(Debug, PartialEq, Eq)]
pub(super) enum LocalTarget {
    NewComponent,
    Versioned { identity: String, deprecation: Option<Value> },
    UserError(String),
}

pub(super) fn resolve_local_target(
    root: &Path,
    bitmap: &bitmap::Bitmap,
    raw_id: &str,
    chalk: Chalk,
) -> io::Result<LocalTarget> {
    let raw_id = raw_id.trim();
    let id = raw_id.split_once('@').map_or(raw_id, |(name, _)| name.trim());
    if id.is_empty() {
        return Err(decline("empty log id"));
    }
    if let Some(target) = resolve_from_bitmap(bitmap, id)? {
        return Ok(target);
    }
    if let Some(identity) = resolve_from_scope_index(root, id)? {
        return Ok(LocalTarget::Versioned { identity, deprecation: None });
    }
    diagnose_missing_local_target(root, raw_id, id, chalk)
}

fn resolve_from_bitmap(bitmap: &bitmap::Bitmap, id: &str) -> io::Result<Option<LocalTarget>> {
    let norm_dir = id.trim_start_matches("./").trim_end_matches('/');
    let dir_matches = bitmap.entries
        .iter()
        .filter(|entry| !norm_dir.is_empty() && entry.root_dir.trim_end_matches('/') == norm_dir)
        .collect::<Vec<_>>();
    let matches = if dir_matches.is_empty() {
        bitmap.entries
            .iter()
            .filter(|entry| {
                entry.identity == id
                    || entry.identity
                        .split_once('/')
                        .is_some_and(|(_, name)| name == id)
            })
            .collect::<Vec<_>>()
    } else {
        dir_matches
    };
    match matches.as_slice() {
        [] => Ok(None),
        [target] if target.version.is_none() => Ok(Some(LocalTarget::NewComponent)),
        [target] => Ok(Some(LocalTarget::Versioned {
            identity: target.identity.clone(),
            deprecation: target.deprecation.clone(),
        })),
        _ => Err(decline("log identity ambiguous")),
    }
}

fn resolve_from_scope_index(root: &Path, id: &str) -> io::Result<Option<String>> {
    let index_path = workspace::scope_path(root).join("index.json");
    let Ok(bytes) = fs::read(index_path) else {
        return Ok(None);
    };
    let index = bit_object_import::parse_jsonc(&bytes).map_err(|_| decline("log index json"))?;
    let Some(rows) = index["components"].as_array().or_else(|| index.as_array()) else {
        return Ok(None);
    };
    let matches = rows
        .iter()
        .filter(|row| row["isSymlink"] != true)
        .filter_map(|row| row_identity_matching(row, id))
        .collect::<Vec<_>>();
    match matches.as_slice() {
        [] => Ok(None),
        [identity] => Ok(Some(identity.clone())),
        _ => Err(decline("log index identity ambiguous")),
    }
}

fn row_identity_matching(row: &Value, target: &str) -> Option<String> {
    let target = target.trim();
    let (scope, name) = if let Some(id_str) = row["id"].as_str() {
        let bare = id_str
            .split('@')
            .next()
            .unwrap_or(id_str);
        bare.split_once('/')
            .unwrap_or(("", bare))
    } else {
        let scope = row["id"]["scope"]
            .as_str()
            .or_else(|| row["id"]["_legacy"]["scope"].as_str())
            .unwrap_or_default();
        let name = row["id"]["name"]
            .as_str()
            .or_else(|| row["id"]["_legacy"]["name"].as_str())?;
        (scope, name)
    };
    let scope = scope.trim();
    let name = name.trim();
    if name.is_empty() {
        return None;
    }
    let full = if scope.is_empty() { name.to_owned() } else { format!("{scope}/{name}") };
    (name == target || full == target).then_some(full)
}

fn diagnose_missing_local_target(
    root: &Path,
    raw_id: &str,
    id: &str,
    chalk: Chalk,
) -> io::Result<LocalTarget> {
    let scope_dir = workspace::scope_path(root);
    if raw_id.starts_with('@')
        || env::var_os("CI").is_some_and(|val| !val.is_empty())
        || (!scope_dir.join("index.json").is_file() && scope_dir.join("objects").is_dir())
    {
        return Err(decline("log missing target delegated"));
    }
    if let Some((scope, name)) = id.split_once('/') {
        if let Err(Failure::User(err)) = validate_scope_name(scope) {
            return Ok(LocalTarget::UserError(err));
        }
        if let Err(Failure::User(err)) = validate_component_name(name) {
            return Ok(LocalTarget::UserError(err));
        }
        let display_id = raw_id
            .strip_suffix("@latest")
            .or_else(|| raw_id.strip_suffix("@head"))
            .unwrap_or(raw_id);
        return Ok(LocalTarget::UserError(format!(
            r#"error: component "{}" was not found"#,
            chalk.bold(display_id),
        )));
    }
    if !id.contains('.') {
        return Ok(LocalTarget::UserError(format!(
            r#"error: component ID "{raw_id}" is invalid, please use the following format: [scope]/<name>"#,
        )));
    }
    Err(decline("log unknown component"))
}

pub(super) fn ordered_parents(logs: &[Value]) -> io::Result<Vec<&Value>> {
    let edges = graph_edges(logs)?;
    let mut postorder = topological_postorder(&edges)?;
    postorder.reverse();
    Ok(postorder
        .into_iter()
        .map(|index| &logs[index])
        .collect())
}

fn graph_edges(logs: &[Value]) -> io::Result<Vec<Vec<usize>>> {
    let indices: HashMap<&str, usize> = logs
        .iter()
        .enumerate()
        .map(|(index, row)| text(row.get("hash")).map(|hash| (hash, index)))
        .collect::<io::Result<_>>()?;
    if indices.len() != logs.len() {
        return Err(decline("log duplicate graph node"));
    }
    logs.iter()
        .map(|row| {
            array(row.get("parents"), "log parents")?
                .iter()
                .map(|parent| {
                    indices
                        .get(text(Some(parent))?)
                        .copied()
                        .ok_or_else(|| decline("log filtered parent graph"))
                })
                .collect()
        })
        .collect()
}

fn topological_postorder(edges: &[Vec<usize>]) -> io::Result<Vec<usize>> {
    // Cleargraph visits nodes and outgoing edges from last to first, then
    // fills the result from the end. An explicit stack handles long histories.
    let mut state = vec![0_u8; edges.len()];
    let mut result = Vec::with_capacity(edges.len());
    for root in (0..edges.len()).rev() {
        if state[root] == 0 {
            visit(root, edges, &mut state, &mut result)?;
        }
    }
    Ok(result)
}

fn visit(
    root: usize,
    edges: &[Vec<usize>],
    state: &mut [u8],
    result: &mut Vec<usize>,
) -> io::Result<()> {
    state[root] = 1;
    let mut stack = vec![(root, edges[root].len())];
    while let Some((node, remaining)) = stack.last_mut() {
        if *remaining == 0 {
            state[*node] = 2;
            result.push(*node);
            stack.pop();
            continue;
        }
        *remaining -= 1;
        let child = edges[*node][*remaining];
        match state[child] {
            0 => {
                state[child] = 1;
                stack.push((child, edges[child].len()));
            }
            1 => return Err(decline("log cyclic parent graph")),
            _ => {}
        }
    }
    Ok(())
}
