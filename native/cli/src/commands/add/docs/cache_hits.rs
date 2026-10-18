//! `ComponentFsCache` cache keys and doc-parser's strict, fractional-millisecond staleness test.
#[cfg(test)]
mod tests;

use super::sources::Source;
use serde_json::{Value, json};
use std::{
    collections::BTreeMap,
    io,
    path::{Path, PathBuf},
};
const MAX_METADATA: usize = 32 * 1024 * 1024;

pub(super) struct Plan {
    pub hits: Vec<Value>,
    pub misses: Vec<Value>,
    pub proven: Vec<Value>,
}

pub(super) fn prepare(
    root: &Path,
    cache: &Path,
    components: &[Value],
    observed: &BTreeMap<PathBuf, Source>,
    enabled: bool,
) -> Plan {
    // Integrity errors canonically clear the entire cache. Let the existing Host
    // reader preserve that cleanup and sequential failure prefix for the whole batch.
    partition(root, cache, components, observed, enabled)
        .unwrap_or_else(|_| Plan {
            hits: Vec::new(),
            misses: components.to_vec(),
            proven: Vec::new(),
        })
}
fn partition(
    root: &Path,
    cache: &Path,
    components: &[Value],
    observed: &BTreeMap<PathBuf, Source>,
    enabled: bool,
) -> io::Result<Plan> {
    let mut plan = Plan { hits: Vec::new(), misses: Vec::new(), proven: Vec::new() };
    let mut bytes = 0;
    for component in components {
        let mut pending = component.clone();
        let files = component["files"].as_array().ok_or_else(|| invalid("docs files"))?;
        let mut misses = Vec::new();
        for file in files
            .iter()
            .filter(|file| file["test"] != true)
        {
            let path = source_path(root, component, file)?;
            let source = observed.get(&path).ok_or_else(|| invalid("docs unknown source"))?;
            if !classify(cache, &path, source, file, enabled, &mut plan, &mut bytes)? {
                misses.push(file.clone());
            }
        }
        if !misses.is_empty() {
            pending["files"] = json!(misses);
            plan.misses.push(pending);
        }
    }
    Ok(plan)
}
fn classify(
    cache: &Path,
    path: &Path,
    source: &Source,
    file: &Value,
    enabled: bool,
    plan: &mut Plan,
    bytes: &mut usize,
) -> io::Result<bool> {
    if let Some(docs) = hit(cache, path, source.mtime_ms(), enabled)? {
        *bytes += serde_json::to_vec(&docs)?.len();
        if *bytes > MAX_METADATA {
            return Err(invalid("docs cache metadata budget"));
        }
        plan.hits.push(json!({"path":path,"docs":docs}));
        return Ok(true);
    }
    if !bit_dependency_scanner::proves_empty_docs(
        source.bytes(),
        file["relativePath"].as_str().unwrap_or_default(),
    ) {
        return Ok(false);
    }
    *bytes += 2;
    if *bytes > MAX_METADATA {
        return Err(invalid("docs cache metadata budget"));
    }
    let row = json!({"path":path,"docs":[]});
    plan.hits.push(row.clone());
    plan.proven.push(row);
    Ok(true)
}

fn hit(cache: &Path, path: &Path, mtime: f64, enabled: bool) -> io::Result<Option<Value>> {
    if !enabled {
        return Ok(None);
    }
    let key = path.to_str().ok_or_else(|| invalid("docs cache source key"))?;
    let Some(entry) = bit_object_import::read_dependency_cache(cache, key)? else {
        return Ok(None);
    };
    let timestamp = &entry["timestamp"];
    if !bit_workspace_config::truthy(timestamp) {
        return Ok(None);
    }
    let timestamp = timestamp
        .as_f64()
        .filter(|time| time.is_finite())
        .ok_or_else(|| invalid("docs cache timestamp requires published coercion"))?;
    if mtime > timestamp {
        return Ok(None);
    }
    let data = entry["data"].as_str().ok_or_else(|| invalid("docs cache data"))?;
    Ok(Some(serde_json::from_str(data)?))
}
pub(super) fn source_path(root: &Path, component: &Value, file: &Value) -> io::Result<PathBuf> {
    let directory = component["directory"].as_str().ok_or_else(|| invalid("docs directory"))?;
    let relative = file["relativePath"].as_str().ok_or_else(|| invalid("docs relative path"))?;
    // Node path.join normalizes both separator spellings on Windows and drops
    // a workspace-root "." segment. Cache keys use that exact absolute spelling.
    Ok(root
        .join(directory)
        .join(relative)
        .components()
        .collect())
}
fn invalid(message: &str) -> io::Error {
    io::Error::other(message)
}
