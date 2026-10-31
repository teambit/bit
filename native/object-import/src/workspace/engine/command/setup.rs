#[cfg(test)]
mod tests;
use super::{
    Record, State, history,
    input::{Operation, Prepare},
    invalid, merge_planning, prepare, proof, repository,
};
use serde_json::{Value, json};
use std::io;
pub(super) fn run(
    mut request: Prepare,
    state: &mut State,
    pool: &rayon::ThreadPool,
) -> io::Result<(usize, Value)> {
    if request.internal_snapshot_preview
        && (request.operation != Operation::Merge || request.options.no_snap)
    {
        return Err(invalid("command snapshot preview options"));
    }
    if state.record.is_some() || state.recovery.is_some() || state.resolve.is_some() {
        return Err(invalid("command owner already active"));
    }
    super::lane_history::resolve(&mut request, state)?;
    let mut proofs = preparation_proofs(&request)?;
    super::lane_history::extend_proofs(&request, state, &mut proofs)?;
    let (context, imported) = prepare::context(&request, pool)?;
    component_controls(&request, &context, &mut proofs)?;
    super::lane_context::validate_additions(&request.root, &context, &mut proofs)?;
    let targets = checkout_targets(&request, &context)?;
    proof::verify(&proofs)?;
    state.sequence =
        state.sequence.checked_add(1).ok_or_else(|| invalid("command sequence limit"))?;
    let token = super::super::hash(format!("{}:{}", std::process::id(), state.sequence).as_bytes());
    let mut repository = repository::Repository::new(&request.root, imported);
    prepare_licenses(&request, &context, &mut repository)?;
    let mut history = history::State::default();
    let targets =
        merge_planning::select_targets(&request, &context, targets, &mut repository, &mut history)?;
    let output =
        json!({"token":token,"context":context,"targets":targets,"progress":repository.progress()});
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

fn prepare_licenses(
    request: &Prepare,
    context: &Value,
    repository: &mut repository::Repository,
) -> io::Result<()> {
    if request.operation == Operation::Merge {
        validate_licenses(context, repository)?;
    } else {
        for scope in license_scopes(context)? {
            repository.prepare_checkout_license(scope)?;
        }
    }
    Ok(())
}

fn checkout_targets(request: &Prepare, context: &Value) -> io::Result<Vec<Value>> {
    let mut targets = prepare::selected(request, context)?;
    if request.operation == Operation::Checkout
        && request.options.to.as_deref().map(str::trim) == Some("head")
        && let Some(tracked) = context["lane"]["trackedTargets"].as_array()
    {
        targets.extend(tracked.iter().cloned());
    }
    Ok(targets)
}

fn preparation_proofs(request: &Prepare) -> io::Result<Vec<proof::Proof>> {
    let mut proofs = Vec::new();
    for name in [
        ".bitmap",
        "workspace.jsonc",
        "package.json",
        ".bit/scope.json",
        ".bit/index.json",
        ".bit/unmerged.json",
    ] {
        let path = name
            .strip_prefix(".bit/")
            .map_or_else(
                || request.root.join(name),
                |name| crate::scope_path(&request.root).join(name),
            );
        proof::read(&path, &mut proofs)?;
    }
    proof::read(&request.home.join(".bitrc.jsonc"), &mut proofs)?;
    Ok(proofs)
}

fn validate_license(scope: &str, repository: &mut repository::Repository) -> io::Result<()> {
    match repository.read(&super::super::hash(scope.as_bytes()), "ScopeMeta") {
        Ok(metadata)
            if metadata
                .get("license")
                .is_some_and(|value| {
                    !value.is_null()
                        && value
                            .as_str()
                            .is_none_or(|lic| !lic.trim().is_empty())
                }) =>
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
    for scope in license_scopes(context)? {
        validate_license(scope, repository)?;
    }
    Ok(())
}

fn license_scopes(context: &Value) -> io::Result<std::collections::HashSet<&str>> {
    let mut scopes = std::collections::HashSet::new();
    let scope_name = context["scope"]["name"]
        .as_str()
        .map(str::trim)
        .filter(|name| !name.is_empty())
        .ok_or_else(|| invalid("command scope name"))?;
    scopes.insert(scope_name);
    let visible = context["targets"].as_array().ok_or_else(|| invalid("command target scopes"))?;
    let lane = context["lane"]["targets"]
        .as_array()
        .map_or(&[][..], Vec::as_slice);
    let scope = context["scopeAddedTargets"]
        .as_array()
        .map_or(&[][..], Vec::as_slice);
    let stash = context["stashAddedTargets"]
        .as_array()
        .map_or(&[][..], Vec::as_slice);
    for target in visible
        .iter()
        .chain(lane)
        .chain(scope)
        .chain(stash)
    {
        let identity = target["identity"]
            .as_str()
            .map(str::trim)
            .ok_or_else(|| invalid("command target identity"))?;
        let target_scope = identity
            .split_once('/')
            .map(|(scope_part, _)| scope_part.trim())
            .filter(|scope_part| !scope_part.is_empty())
            .ok_or_else(|| invalid("command scoped target"))?;
        scopes.insert(target_scope);
    }
    Ok(scopes)
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
    let scope_added = context["scopeAddedTargets"]
        .as_array()
        .map_or(&[][..], Vec::as_slice);
    for target in active
        .iter()
        .chain(additional)
        .chain(scope_added)
    {
        let directory = target["directory"]
            .as_str()
            .map(str::trim)
            .filter(|dir| !dir.is_empty())
            .ok_or_else(|| invalid("command control directory"))?;
        for (name, key) in [("component.json", "config"), ("package.json", "packageJson")] {
            let bytes = proof::read(&request.root.join(directory).join(name), proofs)?;
            let value = bytes
                .map(|bytes| crate::recovery::jsonc::parse(&bytes))
                .transpose()?
                .unwrap_or(Value::Null);
            if value != target[key] {
                return Err(invalid("command component metadata changed"));
            }
        }
    }
    Ok(())
}
