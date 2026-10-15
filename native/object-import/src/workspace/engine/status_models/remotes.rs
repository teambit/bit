use super::invalid;
use crate::read_budget::Budget;
use serde_json::Value;
use std::{
    collections::{HashMap, HashSet},
    fs::File,
    io,
    path::Path,
};

pub(super) fn read(root: &Path, models: &[Value]) -> io::Result<HashMap<String, String>> {
    let scopes = models
        .iter()
        .map(|model| model["scope"].as_str().ok_or_else(|| invalid("status unscoped model")))
        .collect::<io::Result<HashSet<_>>>()?;
    let budget = Budget::new(4 * 1024 * 1024);
    let mut refs = HashMap::new();
    for scope in scopes {
        let rows = rows(root, scope, &budget)?;
        for row in rows {
            insert(&mut refs, &row, scope)?;
        }
    }
    Ok(refs)
}
fn rows(root: &Path, scope: &str, budget: &Budget) -> io::Result<Vec<Value>> {
    if scope.is_empty()
        || matches!(scope, "." | "..")
        || scope
            .bytes()
            .any(|byte| !byte.is_ascii_alphanumeric() && !b"._-".contains(&byte))
    {
        return Err(invalid("status remote scope path"));
    }
    let file = match File::open(
        root.join(".bit/refs/remotes")
            .join(scope)
            .join("main"),
    ) {
        Ok(file) => file,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(error) => return Err(error),
    };
    let rows: Vec<Value> = serde_json::from_slice(&budget.read(file)?).map_err(io::Error::other)?;
    if rows.len() > 4096 {
        return Err(invalid("status remote row limit"));
    }
    Ok(rows)
}

fn insert(refs: &mut HashMap<String, String>, row: &Value, file_scope: &str) -> io::Result<()> {
    let scope =
        row["id"]["scope"].as_str().ok_or_else(|| invalid("status remote component scope"))?;
    let name = row["id"]["name"].as_str().ok_or_else(|| invalid("status remote component name"))?;
    let head = row["head"].as_str().ok_or_else(|| invalid("status remote head"))?;
    crate::merge_history::hash(head)?;
    if scope != file_scope {
        return Ok(());
    }
    refs.entry(format!("{scope}/{name}"))
        .or_insert_with(|| head.to_owned());
    Ok(())
}
