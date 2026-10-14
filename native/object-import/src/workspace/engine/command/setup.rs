#[cfg(test)]
mod tests;
use super::{
    Record, State, history, input::Prepare, invalid, merge_planning, prepare, proof, repository,
};
use serde_json::{Value, json};
use std::io;
pub(super) fn run(
    request: Prepare,
    state: &mut State,
    pool: &rayon::ThreadPool,
) -> io::Result<(usize, Value)> {
    if state.record.is_some() || state.recovery.is_some() || state.resolve.is_some() {
        return Err(invalid("command owner already active"));
    }
    let mut proofs = Vec::new();
    for name in [
        ".bitmap",
        "workspace.jsonc",
        "package.json",
        ".bit/scope.json",
        ".bit/index.json",
        ".bit/unmerged.json",
    ] {
        proof::read(&request.root.join(name), &mut proofs)?;
    }
    let (context, imported) = prepare::context(&request, pool)?;
    component_controls(&request, &context, &mut proofs)?;
    super::lane_context::validate_additions(&request.root, &context, &mut proofs)?;
    let targets = prepare::selected(&request, &context)?;
    proof::verify(&proofs)?;
    state.sequence =
        state.sequence.checked_add(1).ok_or_else(|| invalid("command sequence limit"))?;
    let token = super::super::hash(format!("{}:{}", std::process::id(), state.sequence).as_bytes());
    let mut repository = repository::Repository::new(&request.root, imported);
    validate_licenses(&context, &mut repository)?;
    let mut history = history::State::default();
    let targets =
        merge_planning::select_targets(&request, &context, targets, &mut repository, &mut history)?;
    let output = json!({"token":token,"context":context,"targets":targets});
    let count = targets.len();
    state.record = Some(Record {
        request,
        context,
        targets,
        repository,
        proofs,
        token,
        planned: None,
        history,
    });
    Ok((count, output))
}

fn validate_license(scope: &str, repository: &mut repository::Repository) -> io::Result<()> {
    match repository.read(&super::super::hash(scope.as_bytes()), "ScopeMeta") {
        Ok(metadata)
            if metadata
                .get("license")
                .is_some_and(|value| !value.is_null() && value != "") =>
        {
            return Err(invalid("command scope license requires writer"));
        }
        Err(error) if error.kind() != io::ErrorKind::NotFound => return Err(error),
        _ => {}
    }
    Ok(())
}

pub(super) fn validate_licenses(
    context: &Value,
    repository: &mut repository::Repository,
) -> io::Result<()> {
    let mut scopes = std::collections::HashSet::new();
    scopes.insert(context["scope"]["name"].as_str().ok_or_else(|| invalid("command scope name"))?);
    let visible = context["targets"].as_array().ok_or_else(|| invalid("command target scopes"))?;
    let lane = context["lane"]["targets"]
        .as_array()
        .map_or(&[][..], Vec::as_slice);
    for target in visible.iter().chain(lane) {
        let identity =
            target["identity"].as_str().ok_or_else(|| invalid("command target identity"))?;
        scopes.insert(identity.split_once('/').ok_or_else(|| invalid("command scoped target"))?.0);
    }
    for scope in scopes {
        validate_license(scope, repository)?;
    }
    Ok(())
}

pub(super) fn component_controls(
    request: &Prepare,
    context: &Value,
    proofs: &mut Vec<proof::Proof>,
) -> io::Result<()> {
    let active = context["targets"].as_array().ok_or_else(|| invalid("command control targets"))?;
    let additional = ["inactiveTargets", "addedTargets"]
        .into_iter()
        .flat_map(|field| {
            context["lane"][field]
                .as_array()
                .into_iter()
                .flatten()
        });
    for target in active.iter().chain(additional) {
        let directory =
            target["directory"].as_str().ok_or_else(|| invalid("command control directory"))?;
        for (name, key) in [("component.json", "config"), ("package.json", "packageJson")] {
            let bytes = proof::read(&request.root.join(directory).join(name), proofs)?;
            let value = bytes
                .map(|bytes| serde_json::from_slice::<Value>(&bytes).map_err(io::Error::other))
                .transpose()?
                .unwrap_or(Value::Null);
            if value != target[key] {
                return Err(invalid("command component metadata changed"));
            }
        }
    }
    Ok(())
}
