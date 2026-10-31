use super::{
    invalid, lines,
    sources::{Cache, Sources},
};
use serde::Deserialize;
use serde_json::{Value, json};
use std::{
    collections::{HashMap, HashSet},
    io,
    path::PathBuf,
};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Request {
    pub(super) token: String,
    pub(super) objects_directory: PathBuf,
    snapshot_directory: Option<PathBuf>,
    logs: Vec<Value>,
}
pub(super) fn blame(request: Request, cache: &mut Cache) -> io::Result<Value> {
    if request.logs.len() > 4096 {
        return Err(invalid("history blame record limit"));
    }
    crate::merge_history::path(&request.objects_directory)?;
    let Some(current) = request.logs.first() else {
        return Ok(
            json!({"lines":[],"sources":[],"sourceLoads":[],"reads":super::reads((0,0),(0,0),0)}),
        );
    };
    let mut sources = Sources::new(request.objects_directory, request.snapshot_directory, cache)?;
    let mut rows = initial_rows(&sources.text(reference(current, "fileHash")?)?);
    let mut pending: HashSet<usize> = (0..rows.len()).collect();
    for (log_index, log) in request.logs.iter().enumerate() {
        if pending.is_empty() {
            break;
        }
        let Some(parent) = log
            .get("parentFileHash")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|hash| !hash.is_empty())
        else {
            continue;
        };
        let new = sources.text(reference(log, "fileHash")?)?;
        let old = sources.text(parent)?;
        assign(&lines::diff(&old, &new)?, log, log_index, &mut rows, &mut pending)?;
    }
    if let Some(last_log) = request.logs.last() {
        assign_remaining(&mut rows, pending, last_log, request.logs.len() - 1);
    }
    let mut response = json!({"lines":rows});
    sources.response(&mut response);
    Ok(response)
}
fn initial_rows(text: &str) -> Vec<Value> {
    text.split('\n')
        .enumerate()
        .map(|(index, line)| json!({"lineNumber":index+1,"lineContent":line}))
        .collect()
}
fn assign_remaining(
    rows: &mut [Value],
    pending: HashSet<usize>,
    last_log: &Value,
    last_idx: usize,
) {
    for index in pending {
        metadata(&mut rows[index], last_log);
        rows[index]["logIndex"] = json!(last_idx);
    }
}
fn reference<'a>(log: &'a Value, field: &str) -> io::Result<&'a str> {
    log.get(field)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|hash| !hash.is_empty())
        .ok_or_else(|| invalid("history blame Source ref"))
}
fn metadata(row: &mut Value, log: &Value) {
    for field in ["username", "email", "date", "message", "hash", "tag"] {
        if let Some(value) = log.get(field) {
            row[field] = value.clone();
        } else if let Some(object) = row.as_object_mut() {
            object.remove(field);
        }
    }
}
fn assign(
    parts: &[lines::Part],
    log: &Value,
    log_index: usize,
    rows: &mut [Value],
    pending: &mut HashSet<usize>,
) -> io::Result<()> {
    let mut line = 0;
    let mut removed = HashMap::new();
    let mut added = Vec::new();
    let mut patch = Patch { rows, pending, log, log_index, added: &mut added };
    for part in parts {
        let lines = part.value
            .strip_suffix('\n')
            .unwrap_or(&part.value)
            .split('\n')
            .collect::<Vec<_>>();
        if part.kind == 2 {
            collect_removed(&mut removed, lines, line);
            continue;
        }
        for _ in lines {
            if part.kind == 1 {
                patch.add(line)?;
            }
            line += 1;
        }
    }
    previous_lines(rows, added, &removed);
    Ok(())
}
fn collect_removed<'a>(removed: &mut HashMap<usize, &'a str>, lines: Vec<&'a str>, start: usize) {
    for (index, text) in lines.into_iter().enumerate() {
        removed.insert(start.saturating_add(index), text);
    }
}
fn previous_lines(rows: &mut [Value], added: Vec<usize>, removed: &HashMap<usize, &str>) {
    for index in added {
        if let Some(text) = removed.get(&index) {
            rows[index]["previousLineContent"] = json!(text);
        }
    }
}
struct Patch<'a> {
    rows: &'a mut [Value],
    pending: &'a mut HashSet<usize>,
    log: &'a Value,
    log_index: usize,
    added: &'a mut Vec<usize>,
}
impl Patch<'_> {
    fn add(&mut self, line: usize) -> io::Result<()> {
        if !self.pending.remove(&line) {
            return Ok(());
        }
        let row = self.rows.get_mut(line).ok_or_else(|| invalid("history blame line overflow"))?;
        metadata(row, self.log);
        row["logIndex"] = json!(self.log_index);
        self.added.push(line);
        Ok(())
    }
}
