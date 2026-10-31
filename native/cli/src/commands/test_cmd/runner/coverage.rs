//! Released coverage report consumption, including stale reports without a coverage flag.
mod remove;
use serde_json::{Value, json};
use std::{
    fs, io,
    path::{Path, PathBuf},
};

const METRICS: [&str; 4] = ["lines", "functions", "statements", "branches"];

fn read(root: &Path, directory: &str, main: &str) -> io::Result<Value> {
    let component = Coverage { directory: directory.to_owned(), main: main.to_owned() };
    Ok(read_many(root, &[component])?.remove(0))
}
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
                            .join(&component.directory)
                            .components()
                            .collect::<PathBuf>(),
                        &component.main,
                    )
                })
                .unwrap_or_else(empty)
        })
        .collect();
    if path.exists() {
        remove::directory(&root.join("coverage"))?;
    }
    Ok(reports)
}

fn project(raw: &Value, directory: &Path, main: &str) -> Option<Value> {
    let rows = raw.as_object()?;
    let mut files = Vec::new();
    for (path, metrics) in rows {
        let data = metrics_data(metrics)?;
        if Path::new(path).file_name() == Path::new(main).file_name()
            && METRICS
                .iter()
                .all(|metric| metrics[metric]["pct"].as_f64() == Some(0.0))
        {
            continue;
        }
        if Path::new(path).starts_with(directory) {
            files.push(json!({"path":relative(directory, Path::new(path)),"data":data}));
        }
    }
    let total = totals(&files)?;
    Some(json!({"files":files,"total":total}))
}

fn totals(files: &[Value]) -> Option<Value> {
    let mut totals = json!({});
    for metric in METRICS {
        let sum = |key: &str| {
            files
                .iter()
                .try_fold(0u64, |sum, file| sum.checked_add(file["data"][metric][key].as_u64()?))
        };
        let total = sum("total")?;
        let covered = sum("covered")?;
        let skipped = sum("skipped")?;
        let pct =
            if total == 0 { 0 } else { (covered as f64 / total as f64 * 100.0).round() as u64 };
        totals[metric] = json!({"total":total,"covered":covered,"skipped":skipped,"pct":pct});
    }
    Some(totals)
}

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
        let bitmap = bit_install::workspace::Bitmap::load(root, None)?;
        let entry = bitmap.entries
            .iter()
            .find(|entry| entry.root_dir.trim() == directory)
            .ok_or_else(|| io::Error::other("tester coverage component"))?;
        Ok(Self { directory: directory.to_owned(), main: entry.main_file.trim().to_owned() })
    }
    pub(super) fn collect(&self, root: &Path, result: &mut Value) {
        if result.get("results").is_none() {
            return;
        }
        match read(root, &self.directory, &self.main) {
            Ok(coverage) => result["coverage"] = coverage,
            Err(error) => {
                result["errorMessage"] = json!(
                    crate::commands::workspace_command::filesystem_error::description(&error)
                );
                result["error"] =
                    crate::commands::workspace_command::filesystem_error::json(&error);
                if let Some(map) = result.as_object_mut() {
                    map.remove("results");
                }
            }
        }
    }
    pub(super) fn collect_many(components: &[Self], root: &Path, result: &mut Value) {
        if result.get("results").is_none() {
            return;
        }
        match read_many(root, components) {
            Ok(coverage) => result["componentCoverage"] = json!(coverage),
            Err(error) => {
                result["errorMessage"] = json!(
                    crate::commands::workspace_command::filesystem_error::description(&error)
                );
                result["error"] =
                    crate::commands::workspace_command::filesystem_error::json(&error);
                if let Some(map) = result.as_object_mut() {
                    map.remove("results");
                }
            }
        }
    }
}

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
