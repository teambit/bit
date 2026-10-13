pub(super) mod proof;
mod replay;
mod scan;
#[cfg(test)]
mod tests;
mod validate;

use super::{invalid, resolve_dependencies::Budget};
use rayon::prelude::*;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    collections::{HashMap, HashSet},
    fs, io,
    path::{Path, PathBuf},
};

const MAX_FILES: usize = 4096;
const MAX_BYTES: u64 = 64 * 1024 * 1024;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Request {
    root: PathBuf,
    files: Vec<PathBuf>,
    home: Option<PathBuf>,
    builtins: Vec<String>,
    detector_extensions: Vec<String>,
    typescript: bool,
    include_npm: bool,
    #[serde(default)]
    visited: Option<serde_json::Map<String, Value>>,
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
    registered: Vec<String>,
    detector_scanned: bool,
    source_hash: String,
}

pub(super) fn apply(request: &Request, pool: &rayon::ThreadPool) -> io::Result<(usize, Value)> {
    capture(request, pool, false)
}
pub(super) fn capture(
    request: &Request,
    pool: &rayon::ThreadPool,
    proof: bool,
) -> io::Result<(usize, Value)> {
    validate::validate(request)?;
    let builtins: HashSet<_> = request.builtins
        .iter()
        .map(String::as_str)
        .collect();
    let mut pending = request.files.clone();
    let mut capture = Capture::default();
    let mut rows = HashMap::new();
    let scan_budget = scan::ScanBudget::new(proof);
    let resolver_budget = Budget::capture(proof);
    // Each frontier work-steals across files; replay preserves canonical callback order.
    while !pending.is_empty() {
        let batch = capture.batch(request, &mut pending)?;
        let scanned = pool.install(|| {
            batch
                .par_iter()
                .map(|file| scan::scan(request, file, &builtins, &scan_budget, &resolver_budget))
                .collect::<io::Result<Vec<_>>>()
        })?;
        retain(scanned, &mut rows, &mut pending);
    }
    let count = rows.len();
    let mut output = replay::finish(request, &rows)?;
    if proof {
        output["readSet"] = proof::rows(&rows, resolver_budget.proofs()?)?;
    }
    Ok((count, output))
}

#[derive(Default)]
struct Capture {
    seen: HashSet<PathBuf>,
    bytes: u64,
}
impl Capture {
    fn batch(&mut self, request: &Request, pending: &mut Vec<PathBuf>) -> io::Result<Vec<PathBuf>> {
        let mut batch = Vec::new();
        for file in pending.drain(..) {
            let name = file.to_str().ok_or_else(|| invalid("dependency graph path encoding"))?;
            if request.visited
                .as_ref()
                .is_some_and(|visited| visited.contains_key(name))
                || !self.seen.insert(file.clone())
            {
                continue;
            }
            if self.seen.len() > MAX_FILES {
                return Err(invalid("dependency graph file budget"));
            }
            if self.reserve(&file)? {
                batch.push(file);
            }
        }
        Ok(batch)
    }
    fn reserve(&mut self, file: &Path) -> io::Result<bool> {
        let metadata = match fs::metadata(file) {
            Ok(value) => value,
            Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(false),
            Err(error) => return Err(error),
        };
        self.bytes += metadata.len();
        if !metadata.is_file() || self.bytes > MAX_BYTES {
            return Err(invalid("dependency graph source budget"));
        }
        Ok(true)
    }
}
fn retain(scanned: Vec<Row>, rows: &mut HashMap<String, Row>, pending: &mut Vec<PathBuf>) {
    for row in scanned {
        for dependency in &row.path_map.dependencies {
            if !dependency.resolved_dep.contains("node_modules") {
                pending.push(PathBuf::from(&dependency.resolved_dep));
            }
        }
        rows.insert(row.path_map.file.clone(), row);
    }
}
