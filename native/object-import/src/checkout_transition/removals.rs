use super::{invalid, plan};
use serde::Deserialize;
use serde_json::{Value, json};
use std::io;
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Request {
    token: String,
    tracked: bool,
    workspace_root: bool,
}
pub(super) fn apply(input: Value, state: &plan::State) -> io::Result<Value> {
    let request: Request = serde_json::from_value(input).map_err(io::Error::other)?;
    let plan =
        state.plans.get(request.token.trim()).ok_or_else(|| invalid("stale checkout plan"))?;
    let mut statuses = plan.statuses.clone();
    let mut removals = Vec::new();
    if request.tracked {
        let targeted_paths: std::collections::HashSet<String> = plan.target
            .iter()
            .map(|target| normalize_rel(&target.relative_path))
            .collect();
        for current in &plan.current {
            let current_norm = normalize_rel(&current.relative_path);
            let targeted = targeted_paths.contains(&current_norm);
            if !(targeted || request.workspace_root && current_norm == ".bitmap") {
                statuses.push(
                    json!({"relativePath":current.relative_path.trim(),"status":"removed"}),
                );
                removals.push(current.path.clone());
            }
        }
    }
    Ok(json!({"statuses":statuses,"removals":removals}))
}

fn normalize_rel(path: &str) -> String {
    let replaced = path.trim().replace('\\', "/");
    let mut rest = replaced.as_str().trim_start_matches('/');
    while let Some(stripped) = rest.strip_prefix("./") {
        rest = stripped.trim_start_matches('/');
    }
    rest.trim_end_matches('/').to_owned()
}
