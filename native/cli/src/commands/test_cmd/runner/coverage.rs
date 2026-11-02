//! Released coverage report consumption, including stale reports without a coverage flag.
//!
//! [`read`] and [`read_many`] read [`METRICS`] totals into [`Value`] maps and clean up consumed artifacts via [`remove`].
mod remove;
use serde_json::{Value, json};
use std::{
    fs, io,
    path::{Path, PathBuf},
};

/// Coverage metric keys (`lines`, `functions`, `statements`, `branches`) projected from `coverage-summary.json`.
const METRICS: [&str; 4] = ["lines", "functions", "statements", "branches"];

/// Reads and consumes the coverage summary [`Value`] for a single component at `directory` / `main` via [`read_many`].
#[inline]
fn read(root: &Path, directory: &str, main: &str) -> io::Result<Value> {
    let component =
        Coverage { directory: directory.trim().to_owned(), main: main.trim().to_owned() };
    Ok(read_many(root, &[component])?.remove(0))
}
/// Reads coverage summaries for `components` from `coverage/coverage-summary.json` and removes the `coverage` directory.
fn read_many(root: &Path, components: &[Coverage]) -> io::Result<Vec<Value>> {
    let path = root.join("coverage/coverage-summary.json");
    if !path.exists() {
        return Ok(components
            .iter()
            .map(|_| empty())
            .collect());
    }
    let raw = fs::read(&path)
        .ok()
        .and_then(|bytes| bit_object_import::parse_jsonc(&bytes).ok());
    let reports = components
        .iter()
        .map(|component| {
            raw.as_ref()
                .and_then(|raw| {
                    project(
                        raw,
                        &root
                            .join(component.directory.trim())
                            .components()
                            .collect::<PathBuf>(),
                        component.main.trim(),
                    )
                })
                .unwrap_or_else(empty)
        })
        .collect();
    remove::directory(&root.join("coverage"))?;
    Ok(reports)
}

/// Projects per-file coverage metrics and aggregate [`totals`] for files under `directory`.
fn project(raw: &Value, directory: &Path, main: &str) -> Option<Value> {
    let rows = raw.as_object()?;
    let directory = super::paths::normalized(directory);
    let mut files = Vec::new();
    for (path, metrics) in rows {
        let path = path.trim();
        if path.is_empty() || path == "total" {
            continue;
        }
        let normalized_path = super::paths::normalized(Path::new(path));
        if !normalized_path.starts_with(&directory) {
            continue;
        }
        let data = metrics_data(metrics)?;
        if normalized_path.file_name() == Path::new(main.trim()).file_name()
            && METRICS
                .iter()
                .all(|metric| metrics[metric]["pct"].as_f64() == Some(0.0))
        {
            continue;
        }
        files.push(json!({"path":relative(&directory, &normalized_path),"data":data}));
    }
    let total = totals(&files)?;
    Some(json!({"files":files,"total":total}))
}

/// Aggregates total, covered, skipped, and percentage counts across `files` for each [`METRICS`] key.
fn totals(files: &[Value]) -> Option<Value> {
    let mut totals = json!({});
    for metric in METRICS {
        let (total, covered, skipped) = files
            .iter()
            .try_fold((0u64, 0u64, 0u64), |(tot, cov, skp), file| {
                let row = &file["data"][metric];
                Some((
                    tot.checked_add(row["total"].as_u64()?)?,
                    cov.checked_add(row["covered"].as_u64()?)?,
                    skp.checked_add(row["skipped"].as_u64()?)?,
                ))
            })?;
        let pct =
            if total == 0 { 0 } else { (covered as f64 / total as f64 * 100.0).round() as u64 };
        totals[metric] = json!({"total":total,"covered":covered,"skipped":skipped,"pct":pct});
    }
    Some(totals)
}

#[inline]
pub(super) fn empty() -> Value {
    json!({"files":[],"total":totals(&[]).unwrap_or_default()})
}

fn relative(from: &Path, to: &Path) -> PathBuf {
    let from = super::paths::normalized(from);
    let to = super::paths::normalized(to);
    let from: Vec<_> = from.components().collect();
    let to: Vec<_> = to.components().collect();
    let shared = from
        .iter()
        .zip(&to)
        .take_while(|(left, right)| left == right)
        .count();
    let mut result = PathBuf::new();
    for _ in &from[shared..] {
        result.push("..");
    }
    for component in &to[shared..] {
        result.push(component.as_os_str());
    }
    result
}

pub(super) struct Coverage {
    directory: String,
    main: String,
}
impl Coverage {
    pub(super) fn prepare(root: &Path, directory: &str) -> io::Result<Self> {
        let directory = directory.trim();
        if directory.is_empty() {
            return Err(io::Error::other("tester coverage component"));
        }
        let bitmap = bit_install::workspace::Bitmap::load(root, None)?;
        let entry = bitmap.entries
            .iter()
            .find(|entry| entry.root_dir.trim() == directory)
            .ok_or_else(|| io::Error::other("tester coverage component"))?;
        Ok(Self { directory: directory.to_owned(), main: entry.main_file.trim().to_owned() })
    }
    #[inline]
    pub(super) fn collect(&self, root: &Path, result: &mut Value) {
        if result.get("results").is_none() {
            return;
        }
        match read(root, &self.directory, &self.main) {
            Ok(coverage) => result["coverage"] = coverage,
            Err(error) => record_coverage_error(result, &error),
        }
    }
    #[inline]
    pub(super) fn collect_many(components: &[Self], root: &Path, result: &mut Value) {
        if result.get("results").is_none() {
            return;
        }
        match read_many(root, components) {
            Ok(coverage) => result["componentCoverage"] = json!(coverage),
            Err(error) => record_coverage_error(result, &error),
        }
    }
}

#[inline]
fn record_coverage_error(result: &mut Value, error: &io::Error) {
    use crate::commands::workspace_command::filesystem_error;
    result["errorMessage"] = json!(filesystem_error::description(error));
    result["error"] = filesystem_error::json(error);
    if let Some(map) = result.as_object_mut() {
        map.remove("results");
    }
}

#[inline]
fn metrics_data(metrics: &Value) -> Option<Value> {
    let mut data = json!({});
    for metric in METRICS {
        for count in ["total", "covered", "skipped"] {
            metrics[metric][count].as_u64()?;
        }
        data[metric] = metrics[metric].clone();
    }
    Some(data)
}
