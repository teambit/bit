pub(super) mod proof;
mod replay;
mod scan;
#[cfg(test)]
mod tests;
mod validate;

use super::{invalid, resolve_dependencies::Budget, source_overlay::SourceOverlay};
use rayon::prelude::*;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    collections::{HashMap, HashSet},
    io,
    path::{Path, PathBuf},
};

const MAX_FILES: usize = 4096;
const MAX_BYTES: u64 = 64 * 1024 * 1024;

pub(super) fn scan_request(
    request: &Value,
    pool: &rayon::ThreadPool,
) -> io::Result<(usize, Value)> {
    let input = serde_json::to_string(request).map_err(io::Error::other)?;
    let output = bit_dependency_scanner::scan_request(&input, pool).map_err(io::Error::other)?;
    let count = output["files"]
        .as_array()
        .ok_or_else(|| invalid("dependency scan declined"))?
        .len();
    Ok((count, output))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Request {
    root: PathBuf,
    files: Vec<PathBuf>,
    home: Option<PathBuf>,
    builtins: Vec<String>,
    detector_extensions: Vec<String>,
    #[serde(flatten)]
    detector: DetectorOptions,
    include_npm: bool,
    #[serde(default)]
    visited: Option<serde_json::Map<String, Value>>,
}

#[derive(Deserialize)]
struct DetectorOptions {
    typescript: bool,
    #[serde(default)]
    custom: Option<HashMap<String, CustomDetection>>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct CustomDetection {
    dependencies: Vec<String>,
    typescript: bool,
    source_hash: String,
    #[serde(default)]
    error: Option<Value>,
    #[serde(default)]
    lookups: HashMap<String, Option<PathBuf>>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Dependency {
    import_source: String,
    resolved_dep: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    import_specifiers: Option<Value>,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct PathMap {
    file: String,
    dependencies: Vec<Dependency>,
}
struct Row {
    path_map: PathMap,
    missing: Vec<String>,
    missing_packages: Vec<String>,
    registered: Vec<String>,
    detector_scanned: bool,
    error: Option<Value>,
}

pub(super) fn apply(request: &Request, pool: &rayon::ThreadPool) -> io::Result<(usize, Value)> {
    capture(request, pool, false)
}
pub(super) fn capture(
    request: &Request,
    pool: &rayon::ThreadPool,
    proof: bool,
) -> io::Result<(usize, Value)> {
    capture_view(request, pool, proof, None)
}
pub(super) fn capture_overlay(
    request: &Request,
    pool: &rayon::ThreadPool,
    overlay: &SourceOverlay,
) -> io::Result<(usize, Value)> {
    capture_view(request, pool, true, Some(overlay))
}
fn capture_view(
    request: &Request,
    pool: &rayon::ThreadPool,
    proof: bool,
    overlay: Option<&SourceOverlay>,
) -> io::Result<(usize, Value)> {
    validate::validate(request)?;
    let builtins: HashSet<_> = request.builtins
        .iter()
        .map(|item| item.trim())
        .filter(|item| !item.is_empty())
        .collect();
    let mut pending = request.files.clone();
    let mut capture = Capture::default();
    let mut rows = HashMap::new();
    let scan_budget = scan::ScanBudget::default();
    let resolver_budget = overlay.map_or_else(|| Ok(Budget::capture(proof)), Budget::overlay)?;
    // Each frontier work-steals across files; replay preserves canonical callback order.
    while !pending.is_empty() {
        let batch = capture.batch(request, &mut pending, &resolver_budget)?;
        let scanned = pool.install(|| {
            batch
                .par_iter()
                .map(|file| scan::scan(request, file, &builtins, &scan_budget, &resolver_budget))
                .collect::<io::Result<Vec<_>>>()
        })?;
        retain(scanned, &mut rows, &mut pending);
    }
    let count = rows.len();
    let mut output = replay::finish(request, &rows, &resolver_budget)?;
    if proof {
        output["readSet"] = proof::rows(resolver_budget.proofs()?)?;
    }
    Ok((count, output))
}

#[derive(Default)]
struct Capture {
    seen: HashSet<String>,
    bytes: u64,
}
impl Capture {
    fn batch(
        &mut self,
        request: &Request,
        pending: &mut Vec<PathBuf>,
        budget: &Budget,
    ) -> io::Result<Vec<PathBuf>> {
        let mut batch = Vec::new();
        for file in pending.drain(..) {
            let name = file
                .to_str()
                .map(str::trim)
                .filter(|name| !name.is_empty())
                .ok_or_else(|| invalid("dependency graph path encoding"))?;
            if request.visited
                .as_ref()
                .is_some_and(|visited| visited.contains_key(name))
                || !self.seen.insert(name.to_owned())
            {
                continue;
            }
            if self.seen.len() > MAX_FILES {
                return Err(invalid("dependency graph file budget"));
            }
            if self.reserve(&file, budget)? {
                batch.push(file);
            }
        }
        Ok(batch)
    }
    fn reserve(&mut self, file: &Path, budget: &Budget) -> io::Result<bool> {
        let Some(metadata) = budget.metadata(file)? else { return Ok(false) };
        self.bytes = self.bytes
            .checked_add(metadata.len())
            .ok_or_else(|| invalid("dependency graph source budget"))?;
        if !metadata.is_file() || self.bytes > MAX_BYTES {
            return Err(invalid("dependency graph source budget"));
        }
        Ok(true)
    }
}
fn retain(scanned: Vec<Row>, rows: &mut HashMap<String, Row>, pending: &mut Vec<PathBuf>) {
    for row in scanned {
        for dependency in &row.path_map.dependencies {
            let resolved_dep = dependency.resolved_dep.trim();
            if !resolved_dep.is_empty() && !resolved_dep.contains("node_modules") {
                pending.push(PathBuf::from(resolved_dep));
            }
        }
        rows.insert(row.path_map.file.trim().to_owned(), row);
    }
}
