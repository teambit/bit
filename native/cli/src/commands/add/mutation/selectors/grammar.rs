//! Preserve `ScopeMain`'s ordinary-then-state union and ordered AND syntax via [`patterns`].
//!
//! Validates [`STATES`] criteria and `$env:` multi-parameter state selectors via [`validate`].
#[cfg(test)]
mod tests;

use crate::commands::patterns;
use serde_json::Value;
use std::io;

/// Nine component state selector names recognized by [`validate`].
const STATES: [&str; 9] = [
    "new",
    "modified",
    "deprecated",
    "deleted",
    "internal",
    "snappedOnMain",
    "softTagged",
    "codeModified",
    "localOnly",
];

/// Validates a single `$state` or `$env:` selector criterion against supported [`STATES`].
pub(super) fn validate(criterion: &str) -> io::Result<()> {
    let Some(state) = criterion.trim().strip_prefix('$') else { return Ok(()) };
    if let Some((name, _)) = state.split_once(':') {
        let name = name.trim();
        if name == "env" {
            return Ok(());
        }
        return Err(io::Error::other(format!(
            "byMultiParamState expect the state to be one of the following: ['env'], got {name}",
        )));
    }
    if STATES.contains(&state) {
        return Ok(());
    }
    Err(io::Error::other(format!(
        "state {state} is not recognized, possible values: {}",
        STATES.join(", "),
    )))
}
/// Returns `true` when `criterion` requires loading full component classes (`$modified`, `$deprecated`, `$deleted`, or `$env:`) in `bit-cli`.
#[inline]
pub(super) fn loads(criterion: &str) -> bool {
    let criterion = criterion.trim();
    matches!(criterion, "$modified" | "$deprecated" | "$deleted") || criterion.starts_with("$env:")
}
/// Collects bare component identity strings from `targets` via [`row_identity`] in slice order.
#[inline]
pub(super) fn identities(targets: &[Value]) -> Vec<String> {
    targets
        .iter()
        .filter_map(|row| row_identity(row).map(str::to_owned))
        .collect()
}
/// Matches non-state `parts` against `targets` using [`patterns::extended::matching`] and [`row_identity`].
pub(super) fn ordinary(targets: &[Value], parts: &[String]) -> io::Result<Vec<Value>> {
    let parts = parts
        .iter()
        .filter(|part| !part.starts_with('$') && !part.contains(" AND "))
        .cloned()
        .collect::<Vec<_>>();
    let ids: Vec<&str> = targets
        .iter()
        .filter_map(row_identity)
        .collect();
    let matched = patterns::extended::matching(&ids, &parts)?;
    Ok(matched
        .iter()
        .filter_map(|id| {
            targets
                .iter()
                .find(|row| row_identity(row) == Some(*id))
        })
        .cloned()
        .collect())
}
/// Appends rows from `targets` into `selected` when their bare [`row_identity`] is not already present.
pub(super) fn union(selected: &mut Vec<Value>, targets: Vec<Value>) {
    for row in targets {
        let Some(row_id) = row_identity(&row) else {
            continue;
        };
        if !selected
            .iter()
            .any(|known| row_identity(known) == Some(row_id))
        {
            selected.push(row);
        }
    }
}

#[inline]
fn row_identity(row: &Value) -> Option<&str> {
    row["identity"]
        .as_str()
        .map(str::trim)
        .filter(|id| !id.is_empty())
        .or_else(|| {
            row["id"]
                .as_str()
                .map(str::trim)
                .filter(|id| !id.is_empty())
        })
        .map(|id| id.rsplit_once('@').map_or(id, |(base, _)| base.trim()))
        .filter(|id| !id.is_empty())
}
#[inline]
pub(super) fn no_matches(pattern: &str) -> io::Error {
    io::Error::new(
        io::ErrorKind::InvalidInput,
        format!(r#"unable to find any component matching the "{pattern}" pattern"#),
    )
}

#[inline]
pub(super) fn applied(entered: &str) -> String {
    let entered = entered.trim();
    if let Some(env) = entered.strip_prefix("$env:") {
        format!(
            "$env:{}",
            env.split(':')
                .next()
                .unwrap_or_default()
                .trim(),
        )
    } else {
        entered.into()
    }
}
