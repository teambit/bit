mod effects;

use super::{invalid, plan, wire};
use serde_json::{Value, json};
use std::io;
#[derive(Clone)]
pub(super) struct File {
    pub(super) kind: &'static str,
    pub(super) index: usize,
    pub(super) plan_index: usize,
    pub(super) path: String,
}
pub(super) fn apply(input: Value, state: &plan::State) -> io::Result<Value> {
    let request: wire::Apply = serde_json::from_value(input).map_err(io::Error::other)?;
    let plan =
        state.plans.get(&request.token).ok_or_else(|| invalid("stale checkout apply token"))?;
    let keep = request.current_exists
        && (request.force_ours
            || (plan.has_conflicts && request.strategy.as_deref() == Some("ours")));
    if keep {
        return Ok(
            json!({"keepOurs":true,"files":[],"filesStatus":plan.current.iter().map(|file|json!({"relativePath":file.relative_path,"status":"unchanged"})).collect::<Vec<_>>(),"removals":[]}),
        );
    }
    let (mut files, mut status, removal) = initial(plan, &request, state)?;
    let error = if plan.has_conflicts && request.strategy.as_deref() != Some("manual") {
        None
    } else {
        effects::apply(plan, &mut files, &mut status)?
    };
    let mut output = json!({"keepOurs":false,"files":files.iter().map(|file|json!({"kind":file.kind,"index":file.index,"planIndex":file.plan_index,"relativePath":file.path})).collect::<Vec<_>>(),"filesStatus":status.iter().map(|(path,status)|json!({"relativePath":path,"status":status})).collect::<Vec<_>>(),"removals":removal["removals"]});
    if let Some(message) = error {
        output["deferredError"] = json!({"phase":"applyModified","message":message});
    }
    Ok(output)
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
            index,
            plan_index: plan.target_indices[index],
            path: file.relative_path.clone(),
        })
        .collect::<Vec<_>>();
    let mut status = serde_json::Map::new();
    for row in &plan.statuses {
        status.insert(
            row["relativePath"]
                .as_str()
                .ok_or_else(|| invalid("checkout initial status path"))?
                .into(),
            row["status"].clone(),
        );
    }
    let removal = super::removals::apply(
        json!({"token":request.token,"tracked":request.tracked,"workspaceRoot":request.workspace_root}),
        state,
    )?;
    for row in removal["statuses"].as_array().ok_or_else(|| invalid("checkout removal statuses"))? {
        status.insert(
            row["relativePath"]
                .as_str()
                .ok_or_else(|| invalid("checkout removal path"))?
                .into(),
            row["status"].clone(),
        );
    }
    Ok((files, status, removal))
}
pub(super) fn path(plan: &plan::Plan, row: &Value) -> io::Result<String> {
    if let Some(index) = row["current"].as_u64() {
        return plan.current
            .get(index as usize)
            .map(|file| file.relative_path.clone())
            .ok_or_else(|| invalid("checkout current merge index"));
    }
    let index =
        row["other"].as_u64().ok_or_else(|| invalid("checkout other merge index missing"))?;
    plan.target
        .get(index as usize)
        .map(|file| file.relative_path.clone())
        .ok_or_else(|| invalid("checkout other merge index"))
}
pub(super) fn error_path(path: &str) -> String {
    error_path_for_platform(path, cfg!(windows))
}
fn error_path_for_platform(path: &str, windows: bool) -> String {
    if windows { path.replace('/', r"\") } else { path.to_owned() }
}
#[cfg(test)]
mod tests;
