//! [`read`] and validate remote `main` refs under [`Budget`] for status models.

use super::invalid;
use crate::read_budget::Budget;
use serde_json::Value;
use std::{
    collections::{HashMap, HashSet},
    fs::File,
    io,
    path::Path,
};

/// Reads and validates remote `main` head references under `refs/remotes` for `models`.
/// Enforces a 4 MiB read budget across all referenced remote scope ref files.
pub(super) fn read(root: &Path, models: &[Value]) -> io::Result<HashMap<String, String>> {
    let scopes = models
        .iter()
        .filter_map(|model| {
            model["scope"]
                .as_str()
                .map(str::trim)
                .filter(|scope| !scope.is_empty())
        })
        .collect::<HashSet<_>>();
    let budget = Budget::new(4 * 1024 * 1024);
    let remotes_dir = crate::scope_path(root).join("refs/remotes");
    let mut refs = HashMap::with_capacity(models.len());
    for scope in scopes {
        let rows = rows(&remotes_dir, scope, &budget)?;
        for row in rows {
            insert(&mut refs, &row, scope)?;
        }
    }
    Ok(refs)
}
/// Reads the remote `main` ref entries for `scope` under `remotes_dir`.
#[inline]
fn rows(remotes_dir: &Path, scope: &str, budget: &Budget) -> io::Result<Vec<Value>> {
    if scope.is_empty()
        || matches!(scope, "." | "..")
        || scope
            .bytes()
            .any(|byte| !byte.is_ascii_alphanumeric() && !b"._-".contains(&byte))
    {
        return Err(invalid("status remote scope path"));
    }
    let file = match File::open(remotes_dir.join(scope).join("main")) {
        Ok(file) => file,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(error) => return Err(error),
    };
    let rows: Vec<Value> = crate::parse_jsonc(&budget.read(file)?)
        .and_then(|val| serde_json::from_value(val).map_err(io::Error::other))?;
    if rows.len() > 4096 {
        return Err(invalid("status remote row limit"));
    }
    Ok(rows)
}

/// Validates `row` and inserts `<scope>/<name> -> head` into `refs` when `scope == file_scope`.
#[inline]
fn insert(refs: &mut HashMap<String, String>, row: &Value, file_scope: &str) -> io::Result<()> {
    let (scope, name) =
        crate::workspace::engine::command::inbound::remote::file_list::row_scoped_id_parts(row)
            .ok_or_else(|| invalid("status remote component scope"))?;
    let head = row["head"]
        .as_str()
        .map(str::trim)
        .ok_or_else(|| invalid("status remote head"))?;
    let head = crate::validate::hexadecimal(&crate::merge_history::hash(head)?);
    if scope != file_scope {
        return Ok(());
    }
    if refs
        .insert(format!("{scope}/{name}"), head)
        .is_some()
    {
        return Err(invalid("status duplicate remote ref"));
    }
    Ok(())
}
