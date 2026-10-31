//! `filterDiffResults` and `outputDiffResultsFormatted` of component-diff.

mod tables;
#[cfg(test)]
mod tests;

use super::options::Options;
use crate::commands::{
    color::Chalk,
    status::js::{array, decline, text},
};
use serde_json::{Value, json};
use std::io;

pub(super) fn filtered(result: &Value, options: &Options) -> io::Result<Value> {
    let rows = array(Some(result), "diff results")?;
    rows.iter()
        .map(|row| filter_one(row, options))
        .collect::<io::Result<Vec<_>>>()
        .map(Value::Array)
}

fn filter_one(row: &Value, options: &Options) -> io::Result<Value> {
    let mut row = row.clone();
    if options.output.table {
        tables::format(&mut row)?;
    }
    let files = array(row.get("filesDiff"), "diff files")?;
    let files =
        if options.output.configs_only { Vec::new() } else { selected_files(files, options) };
    row["filesDiff"] = json!(
        files
            .into_iter()
            .map(|file| project_file(file, options))
            .collect::<io::Result<Vec<_>>>()?
    );
    if options.output.files_only || !options.output.files.is_empty() {
        row["fieldsDiff"] = Value::Null;
    }
    Ok(row)
}

fn selected_files(files: &[Value], options: &Options) -> Vec<Value> {
    if options.output.files.is_empty() {
        return files.to_vec();
    }
    files
        .iter()
        .filter(|file| {
            file["filePath"]
                .as_str()
                .map(str::trim)
                .filter(|path| !path.is_empty())
                .is_some_and(|path| {
                    options.output.files.iter().any(|filter| matches_file(path, filter))
                })
        })
        .cloned()
        .collect()
}

fn project_file(mut file: Value, options: &Options) -> io::Result<Value> {
    if options.output.stat {
        let (additions, deletions) = counts(file["diffOutput"].as_str().unwrap_or(""));
        file.as_object_mut()
            .ok_or_else(|| decline("diff file"))?
            .remove("diffOutput");
        file["additions"] = json!(additions);
        file["deletions"] = json!(deletions);
    } else if options.output.name_only {
        file.as_object_mut()
            .ok_or_else(|| decline("diff file"))?
            .remove("diffOutput");
    }
    Ok(file)
}

fn matches_file(path: &str, filter: &str) -> bool {
    let path = path.trim();
    let path = path.strip_prefix("./").unwrap_or(path);
    let filter = filter.trim();
    let filter = filter.strip_prefix("./").unwrap_or(filter);
    !filter.is_empty() && (path == filter || path.ends_with(&format!("/{filter}")))
}

fn counts(diff: &str) -> (usize, usize) {
    let mut additions = 0;
    let mut deletions = 0;
    for line in diff.split('\n') {
        if line.starts_with("+++ ") || line.starts_with("--- ") {
            continue;
        }
        if line.starts_with('+') {
            additions += 1;
        } else if line.starts_with('-') {
            deletions += 1;
        }
    }
    (additions, deletions)
}

pub(super) fn json(result: &mut Value) -> io::Result<()> {
    for row in result.as_array_mut().ok_or_else(|| decline("diff results"))? {
        let previous = row.as_object().ok_or_else(|| decline("diff row"))?;
        let mut ordered = serde_json::Map::new();
        for key in ["id", "hasDiff", "filesDiff", "fieldsDiff"] {
            if let Some(value) = previous.get(key) {
                ordered.insert(key.to_string(), value.clone());
            }
        }
        *row = Value::Object(ordered);
    }
    Ok(())
}

pub(super) fn format(result: &Value, chalk: Chalk, options: &Options) -> io::Result<String> {
    let rows = array(Some(result), "diff results")?;
    if rows.is_empty() {
        return Ok(chalk.yellow("there are no modified components to diff"));
    }
    rows.iter()
        .map(|row| one(row, chalk, options))
        .collect::<io::Result<Vec<_>>>()
        .map(|rows| rows.join("\n\n"))
}

fn one(row: &Value, chalk: Chalk, options: &Options) -> io::Result<String> {
    let id = text(row.get("id"))?.trim();
    if row["hasDiff"] != true {
        let id = text(row.get("_fullId"))?.trim();
        let suffix = if options.output.name_only || options.output.stat {
            ""
        } else {
            " (consider running with --verbose)"
        };
        return Ok(format!("no diff for {}{suffix}", chalk.bold(id)));
    }
    let title = format!("showing diff for {}", chalk.bold(id));
    if options.output.name_only || options.output.stat {
        return summary(row, &title, options.output.stat);
    }
    let separator = "-".repeat(title.len());
    let title = chalk.cyan(&format!("{separator}\n{title}\n{separator}"));
    let files = array(row.get("filesDiff"), "diff files")?
        .iter()
        .filter_map(|file| file["diffOutput"].as_str())
        .collect::<Vec<_>>();
    let fields = array(row.get("fieldsDiff"), "diff fields")?
        .iter()
        .filter_map(|field| field["diffOutput"].as_str())
        .collect::<Vec<_>>();
    if files.is_empty() && fields.is_empty() {
        return Ok(format!("{title}\n(no matching changes for the given filters)"));
    }
    Ok(format!("{title}\n{}\n{}", files.join("\n"), fields.join("\n")))
}

fn summary(row: &Value, title: &str, stat: bool) -> io::Result<String> {
    let files = array(row.get("filesDiff"), "diff files")?;
    let fields = array(row.get("fieldsDiff"), "diff fields")?;
    let width = if stat {
        files
            .iter()
            .filter_map(|file| {
                file["filePath"]
                    .as_str()
                    .map(|path| path.trim().len())
            })
            .max()
            .unwrap_or(0)
    } else {
        0
    };
    let mut lines = Vec::new();
    for file in files {
        let status = match text(file.get("status"))?.trim() {
            "MODIFIED" => "M",
            "NEW" => "A",
            "DELETED" => "D",
            _ => return Err(decline("diff status")),
        };
        let path = text(file.get("filePath"))?.trim();
        if stat {
            let added = file["additions"].as_u64().ok_or_else(|| decline("diff additions"))?;
            let deleted = file["deletions"].as_u64().ok_or_else(|| decline("diff deletions"))?;
            lines.push(format!("{status} {path:width$}  +{added} -{deleted}"));
        } else {
            lines.push(format!("{status} {path}"));
        }
    }
    for field in fields {
        lines.push(format!("F {}", text(field.get("fieldName"))?.trim()));
    }
    if lines.is_empty() {
        return Ok(format!("{title}\n(no matching changes)"));
    }
    Ok(format!("{title}\n{}", lines.join("\n")))
}
