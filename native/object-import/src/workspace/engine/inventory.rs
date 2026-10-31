pub(super) mod patterns;
mod rules;
#[cfg(test)]
mod tests;

use super::{invalid, scan};
use rayon::ThreadPool;
use rules::{Matcher, Policy};
use serde::Deserialize;
use serde_json::{Value, json};
use std::{
    collections::HashMap,
    io,
    path::{Path, PathBuf},
};

#[derive(Default)]
pub(crate) struct State {
    next: u64,
    plans: HashMap<u64, Plan>,
}
struct Plan {
    paths: Vec<String>,
    root_filtered: Vec<String>,
    directory: String,
    workspace_root: bool,
    nested: bool,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Begin {
    root: PathBuf,
    workspace: PathBuf,
    exclude_dirs: Vec<PathBuf>,
    root_policy: Policy,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Finish {
    token: u64,
    combined: Policy,
    hard: Policy,
    own: Policy,
    ignored_root: Vec<String>,
}
pub(super) fn begin(
    input: Begin,
    state: &mut State,
    pool: &ThreadPool,
) -> io::Result<(usize, Value)> {
    if state.plans.len() >= 32 || state.next >= (1 << 53) - 1 {
        return Err(invalid("inventory pending scan limit"));
    }
    super::path(&input.workspace)?;
    let directory = relative(&input.workspace, &input.root)?;
    let workspace_root = directory.is_empty();
    let paths = scan::scan(&input.root, &input.exclude_dirs, workspace_root)?
        .iter()
        .map(|file| relative(&input.workspace, Path::new(file)))
        .collect::<io::Result<Vec<_>>>()?;
    validate_paths(&paths, state)?;
    let mut root_policy = Matcher::new(input.root_policy)?;
    let root_filtered = root_policy.filter(&paths, pool);
    let nested = if workspace_root {
        patterns::nested(&input.workspace, &paths, &mut root_policy, pool)?
    } else {
        Vec::new()
    };
    let own =
        if workspace_root || paths.is_empty() { Vec::new() } else { patterns::own(&input.root)? };
    state.next += 1;
    let output = json!({"token":state.next,"count":paths.len(),"nested":nested,"own":own,"cache":root_policy.changes});
    let nested = !nested.is_empty();
    let count = paths.len();
    state.plans.insert(
        state.next,
        Plan { paths, root_filtered, directory, workspace_root, nested },
    );
    Ok((count, output))
}
fn validate_paths(paths: &[String], state: &State) -> io::Result<()> {
    if paths.len()
        + state.plans
            .values()
            .map(|plan| plan.paths.len())
            .sum::<usize>()
        > 4096
    {
        return Err(invalid("inventory retained path limit"));
    }
    // The pinned regex engine's legacy case folding differs from V8 for some
    // non-ASCII characters. Keep those inventories on the canonical path.
    if paths
        .iter()
        .any(|path| !path.is_ascii() || path.contains('\\'))
    {
        return Err(invalid("inventory requires ASCII paths"));
    }
    validate_prefixes(paths)?;
    let retained = state.plans
        .values()
        .flat_map(|plan| &plan.paths)
        .map(String::len)
        .sum::<usize>();
    if retained
        + paths
            .iter()
            .map(String::len)
            .sum::<usize>()
        > super::MAX_RAW
    {
        return Err(invalid("inventory retained path bytes limit"));
    }
    Ok(())
}
fn validate_prefixes(paths: &[String]) -> io::Result<()> {
    let mut count = paths.len();
    let mut bytes = paths
        .iter()
        .map(String::len)
        .sum::<usize>();
    for path in paths {
        let mut depth = 0;
        for (offset, _) in path.match_indices('/') {
            depth += 1;
            count += 1;
            bytes += offset + 1;
        }
        if depth > 128 || count > 65536 || bytes > super::MAX_RAW {
            return Err(invalid("inventory ignore parent cache limit"));
        }
    }
    Ok(())
}
pub(super) fn finish(
    input: Finish,
    state: &mut State,
    pool: &ThreadPool,
) -> io::Result<(usize, Value)> {
    let mut plan =
        state.plans.remove(&input.token).ok_or_else(|| invalid("stale inventory token"))?;
    let mut combined = Matcher::new(input.combined)?;
    let mut hard = Matcher::new(input.hard)?;
    let mut own = Matcher::new(input.own)?;
    let mut paths = if plan.nested {
        hard.filter(&combined.filter(&plan.paths, pool), pool)
    } else {
        std::mem::take(&mut plan.root_filtered)
    };
    keep_bitmap(&plan, &mut paths);
    let prefix = format!("{}/", plan.directory);
    let mut paths = paths
        .into_iter()
        .map(|path| {
            if plan.workspace_root {
                path
            } else {
                path.strip_prefix(&prefix)
                    .unwrap_or(&path)
                    .to_owned()
            }
        })
        .filter(|path| !input.ignored_root.contains(path))
        .collect::<Vec<_>>();
    if !plan.workspace_root {
        paths = own.filter(&paths, pool);
    }
    paths.sort_by(|left, right| left.encode_utf16().cmp(right.encode_utf16()));
    let files: Vec<_> = paths
        .iter()
        .map(|path| json!({"relativePath":path,"name":path.rsplit('/').next(),"test":false}))
        .collect();
    Ok((files.len(), json!({"files":files})))
}
fn keep_bitmap(plan: &Plan, paths: &mut Vec<String>) {
    if plan.workspace_root
        && plan.paths
            .iter()
            .any(|path| path == ".bitmap")
        && !paths
            .iter()
            .any(|path| path == ".bitmap")
    {
        paths.push(".bitmap".to_owned());
    }
}
pub(super) fn cancel(token: u64, state: &mut State) -> io::Result<(usize, Value)> {
    state.plans.remove(&token).ok_or_else(|| invalid("stale inventory token"))?;
    Ok((1, json!({"cancelled":true})))
}
fn relative(root: &Path, file: &Path) -> io::Result<String> {
    let relative =
        file.strip_prefix(root).map_err(|_| invalid("inventory root outside workspace"))?;
    Ok(relative
        .components()
        .map(|part| {
            part.as_os_str()
                .to_str()
                .ok_or_else(|| invalid("inventory non-UTF8 path"))
        })
        .collect::<io::Result<Vec<_>>>()?
        .join("/"))
}

/// Share the bounded inventory scanner with component tracking.
pub(crate) fn tracking_scan(
    root: &Path,
    excluded: &[PathBuf],
    workspace_root: bool,
) -> io::Result<Vec<String>> {
    scan::scan(root, excluded, workspace_root)
}

/// Compile and evaluate the same node-ignore rules as ordinary component inventory.
pub(crate) fn tracking_filter(paths: &[String], patterns: &[String]) -> io::Result<Vec<String>> {
    let mut compiler = bit_ignore::Ignore::new();
    compiler
        .add(patterns.iter().map(String::as_str))
        .map_err(io::Error::other)?;
    let policy = serde_json::from_value(serde_json::json!({"rules":compiler.rules()}))
        .map_err(io::Error::other)?;
    let mut matcher = Matcher::new(policy)?;
    Ok(paths
        .iter()
        .filter(|path| matcher.keep(path))
        .cloned()
        .collect())
}

pub(crate) fn tracking_ignore(root: &Path) -> io::Result<Vec<String>> {
    patterns::own(root)
}
