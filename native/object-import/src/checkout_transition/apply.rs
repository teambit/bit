//! Checkout plan application ([`apply`]) and conflict resolution strategy evaluation for [`File`] entries.

mod effects;
#[cfg(test)]
mod tests;

use super::{invalid, plan, wire};
use serde_json::{Value, json};
use std::io;
#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct File {
    pub(super) kind: &'static str,
    pub(super) index: usize,
    pub(super) plan_index: usize,
    pub(super) path: String,
    pub(super) alias_kind: &'static str,
    pub(super) alias_index: usize,
}
pub(super) fn apply(input: Value, state: &plan::State) -> io::Result<Value> {
    let request: wire::Apply = serde_json::from_value(input).map_err(io::Error::other)?;
    let plan = state.plans
        .get(request.token.trim())
        .ok_or_else(|| invalid("stale checkout apply token"))?;
    let strategy = request.strategy.as_deref().map(str::trim);
    if request.current_exists
        && (request.force_ours || (plan.has_conflicts && strategy_eq(strategy, "ours")))
    {
        return Ok(
            json!({"keepOurs":true,"files":[],"filesStatus":plan.current.iter().map(|file|json!({"relativePath":file.relative_path.trim(),"status":"unchanged"})).collect::<Vec<_>>(),"removals":[]}),
        );
    }
    let (mut files, mut status, removal) = initial(plan, &request, state)?;
    let error = if plan.has_conflicts && !strategy_eq(strategy, "manual") {
        None
    } else {
        effects::apply(plan, &mut files, &mut status)?
    };
    let mut output = json!({"keepOurs":false,"files":files.iter().map(|file|json!({"kind":file.kind,"index":file.index,"planIndex":file.plan_index,"relativePath":file.path,"aliasKind":file.alias_kind,"aliasIndex":file.alias_index})).collect::<Vec<_>>(),"filesStatus":status.iter().map(|(path,status)|json!({"relativePath":path,"status":status})).collect::<Vec<_>>(),"removals":removal["removals"]});
    if let Some(message) = error {
        output["deferredError"] = json!({"phase":"applyModified","message":message});
    }
    Ok(output)
}
#[inline]
fn strategy_eq(strategy: Option<&str>, expected: &str) -> bool {
    strategy.is_some_and(|strat| strat.eq_ignore_ascii_case(expected))
}
fn initial(
    plan: &plan::Plan,
    request: &wire::Apply,
    state: &plan::State,
) -> io::Result<(Vec<File>, serde_json::Map<String, Value>, Value)> {
    let files = plan.target
        .iter()
        .enumerate()
        .map(|(index, file)| File {
            kind: "target",
            alias_kind: "target",
            alias_index: index,
            index,
            plan_index: plan.target_indices[index],
            path: file.relative_path.trim().to_owned(),
        })
        .collect::<Vec<_>>();
    let mut status = serde_json::Map::new();
    insert_statuses(&mut status, &plan.statuses, "checkout initial status path")?;
    let removal = super::removals::apply(
        json!({"token":request.token,"tracked":request.tracked,"workspaceRoot":request.workspace_root}),
        state,
    )?;
    let removal_rows =
        removal["statuses"].as_array().ok_or_else(|| invalid("checkout removal statuses"))?;
    insert_statuses(&mut status, removal_rows, "checkout removal path")?;
    Ok((files, status, removal))
}
#[inline]
fn insert_statuses(
    status: &mut serde_json::Map<String, Value>,
    rows: &[Value],
    message: &'static str,
) -> io::Result<()> {
    for row in rows {
        status.insert(
            row["relativePath"]
                .as_str()
                .map(str::trim)
                .filter(|path| !path.is_empty())
                .ok_or_else(|| invalid(message))?
                .into(),
            row["status"].clone(),
        );
    }
    Ok(())
}
#[inline]
pub(super) fn path<'a>(plan: &'a plan::Plan, row: &Value) -> io::Result<&'a str> {
    if let Some(index) = row["current"].as_u64() {
        return plan.current
            .get(index as usize)
            .map(|file| file.relative_path.as_str())
            .ok_or_else(|| invalid("checkout current merge index"));
    }
    let index =
        row["other"].as_u64().ok_or_else(|| invalid("checkout other merge index missing"))?;
    plan.other
        .as_ref()
        .unwrap_or(&plan.target)
        .get(index as usize)
        .map(|file| file.relative_path.as_str())
        .ok_or_else(|| invalid("checkout other merge index"))
}
#[inline]
pub(super) fn error_path(path: &str) -> String {
    error_path_for_platform(path, cfg!(windows))
}
#[inline]
fn error_path_for_platform(path: &str, windows: bool) -> String {
    if windows { path.replace('/', r"\") } else { path.to_owned() }
}
