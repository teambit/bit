//! File-ownership filtering ([`filter`]) and already-used warning generation for `bit add` [`Candidate`]s.

use super::{Candidate, Plan, error, rows};
use serde_json::{Value, json};
use std::io;
/// Filters out candidate files already owned by other active components and records warnings.
pub(super) fn filter(
    plan: &mut Plan,
    candidate: &mut Candidate,
    existing: Option<&Value>,
) -> io::Result<()> {
    existing_root(candidate, existing)?;
    let owned = plan.bitmap
        .as_object()
        .ok_or_else(|| error("invalid component bitmap"))?
        .iter()
        .filter(|(_, row)| super::super::active(row))
        .filter_map(|(key, row)| {
            Some((
                rows::row_name(key, row)?.to_owned(),
                row["rootDir"]
                    .as_str()
                    .map(str::trim)
                    .filter(|dir| !dir.is_empty())?
                    .to_owned(),
                row.clone(),
            ))
        })
        .collect::<Vec<_>>();
    let candidate_scope = candidate.scope.as_str();
    let candidate_name = candidate.name.as_str();
    candidate.files.retain(|file| {
        let owner = owned
            .iter()
            .find(|(name, root, row)| {
                is_owned_by_other((candidate_scope, candidate_name), name, root, row, file)
            });
        if let Some((name, _, row)) = owner {
            warning(&mut plan.warnings, name, row, file);
            false
        } else {
            true
        }
    });
    Ok(())
}

/// Reject adding files outside an existing component's `rootDir` unless `candidate.directory` encloses `rootDir`.
fn existing_root(candidate: &Candidate, existing: Option<&Value>) -> io::Result<()> {
    if let Some(root) = existing
        .and_then(|row| row["rootDir"].as_str())
        .map(str::trim)
        .filter(|dir| !dir.is_empty())
        && root != candidate.directory
        && !root
            .strip_prefix(&candidate.directory)
            .is_some_and(|rest| rest.starts_with('/'))
    {
        return Err(error(format!(
            "unable to add individual files outside the root dir ({root}) of {}/{}.\nyou can add the directory these files are located at and it'll change the root dir of the component accordingly",
            candidate.scope, candidate.name,
        )));
    }
    Ok(())
}

/// Record an `alreadyUsed` warning entry for `file` under the owning component `name` and `row`.
#[inline]
fn warning(warnings: &mut Value, name: &str, row: &Value, file: &str) {
    let scope = rows::scope(row).unwrap_or_default();
    let key = if scope.is_empty() { name.to_owned() } else { format!("{scope}/{name}") };
    if !warnings["alreadyUsed"][&key].is_array() {
        warnings["alreadyUsed"][&key] = json!([]);
    }
    if let Some(entries) = warnings["alreadyUsed"][&key].as_array_mut() {
        entries.push(json!(file));
    }
}

#[inline]
fn is_owned_by_other(
    (candidate_scope, candidate_name): (&str, &str),
    name: &str,
    root: &str,
    row: &Value,
    file: &str,
) -> bool {
    let row_scope = rows::scope(row).unwrap_or_default();
    (name != candidate_name || row_scope != candidate_scope.trim())
        && root != "."
        && file
            .strip_prefix(root)
            .is_some_and(|rest| rest.starts_with('/'))
}
