use super::{
    super::{
        Record, State, history, input, invalid, prepare as command_prepare, proof, repository,
    },
    Operation, Prepare, Retained, restore,
};
use crate::{
    command_import,
    recovery::jsonc,
    workspace::engine::{client_status::config, status_context},
};
use serde_json::{Value, json};
use std::io;

pub(super) fn prepare(
    request: &Prepare,
    state: &mut State,
    pool: &rayon::ThreadPool,
) -> io::Result<Retained> {
    validate(request)?;
    let mut proofs = controls(request)?;
    let restore = restore::prepare(&request.root, request.operation, &mut proofs)?;
    let (context, ordinary, imported) = metadata(request, &restore, pool)?;
    let pending = proof::read(&request.root.join(".bit/unmerged.json"), &mut proofs)?
        .map(|bytes| serde_json::from_slice::<Value>(&bytes).map_err(io::Error::other))
        .transpose()?
        .unwrap_or(json!([]));
    command_prepare::selected(&ordinary, &context)?;
    let (mut targets, remaining) = select(&context, &pending, request)?;
    validate_pending_configuration(request, &targets, &pending)?;
    let pending = remaining;
    capture_controls(request, &mut targets, &mut proofs)?;
    proof::verify(&proofs)?;
    state.sequence = state.sequence.checked_add(1).ok_or_else(|| invalid("recovery sequence"))?;
    let token = crate::workspace::engine::hash(
        format!("recovery:{}:{}", std::process::id(), state.sequence).as_bytes(),
    );
    let mut repository = repository::Repository::new(&request.root, Some(imported));
    super::super::setup::validate_licenses(&context, &mut repository)?;
    let record = Record {
        request: ordinary,
        context,
        targets,
        repository,
        proofs,
        token,
        planned: None,
        history: history::State::default(),
    };
    Ok(Retained {
        record,
        operation: request.operation,
        restore,
        pending,
        result: Value::Null,
        restored: false,
        restored_file_id: None,
    })
}
fn validate(request: &Prepare) -> io::Result<()> {
    for path in [&request.root, &request.home, &request.global_remotes_file] {
        crate::workspace::engine::path(path)?;
    }
    if !request.options.skip_dependency_installation
        || request.home.join(".bitrc.jsonc").try_exists()?
        || request.root.join(".bitTmp").try_exists()?
        || (request.operation == Operation::LaneAbort && !request.options.silent)
    {
        return Err(invalid("recovery requires canonical lifecycle"));
    }
    Ok(())
}
fn controls(request: &Prepare) -> io::Result<Vec<proof::Proof>> {
    let mut proofs = Vec::new();
    for name in [
        ".bitmap",
        "workspace.jsonc",
        "package.json",
        ".bit/scope.json",
        ".bit/index.json",
        ".bit/unmerged.json",
        "merge-conflict",
    ] {
        proof::read(&request.root.join(name), &mut proofs)?;
    }
    Ok(proofs)
}
fn metadata(
    request: &Prepare,
    restore: &restore::Prepared,
    pool: &rayon::ThreadPool,
) -> io::Result<(Value, input::Prepare, command_import::PreparedImport)> {
    let bitmap = jsonc::parse(&restore.bitmap)?;
    let workspace = jsonc::parse(&restore.workspace)?;
    let settings = config::configuration_value(&request.root, &workspace, true)?;
    let (structural_bitmap, bitmap_configs) = super::bitmap::project(&bitmap)?;
    let targets = super::super::lane_context::visibility::targets(&structural_bitmap, &settings)?;
    let mut context = status_context::metadata_for_recovery(
        &status_context::Request {
            root: request.root.clone(),
            home: request.home.clone(),
            history: false,
        },
        pool,
        &settings,
        targets,
    )?;
    context["workspace"] = workspace;
    attach(&mut context, &bitmap, &bitmap_configs)?;
    let ordinary:input::Prepare=serde_json::from_value(json!({"root":request.root,"home":request.home,"globalRemotesFile":request.global_remotes_file,"operation":"checkout","options":{"to":"reset","all":true,"skipDependencyInstallation":true},"dependencyGrammar":request.dependency_grammar})).map_err(io::Error::other)?;
    let mut imported = command_import::prepare_lane(&request.root, &request.global_remotes_file)?;
    if request.operation == Operation::LaneAbort {
        imported.recovery_staged(restore.staged_snaps.as_deref())?;
    }
    command_prepare::extend_models(&ordinary, pool, &mut context, Some(&imported))?;
    guards::extensions(&context)?;
    Ok((context, ordinary, imported))
}
fn attach(
    context: &mut Value,
    bitmap: &Value,
    bitmap_configs: &std::collections::HashMap<String, Value>,
) -> io::Result<()> {
    if let Some(header) = bitmap.get("_bit_lane") {
        if !header["id"]["scope"].is_string() || !header["id"]["name"].is_string() {
            return Err(invalid("recovery lane header"));
        }
        context["lane"] = json!({"currentId":header["id"],"targets":[],"additions":[]});
    }
    for target in
        context["targets"].as_array_mut().ok_or_else(|| invalid("recovery context targets"))?
    {
        if let Some(config) = target["directory"]
            .as_str()
            .and_then(|directory| bitmap_configs.get(directory))
        {
            target["bitmapConfig"] = config.clone();
        }
    }
    Ok(())
}

fn capture_controls(
    request: &Prepare,
    targets: &mut [Value],
    proofs: &mut Vec<proof::Proof>,
) -> io::Result<()> {
    for target in targets {
        let directory = target["directory"].as_str().ok_or_else(|| invalid("recovery root"))?;
        let path = request.root.join(directory);
        let metadata = std::fs::symlink_metadata(&path);
        match metadata {
            Ok(meta) if meta.is_dir() && !meta.file_type().is_symlink() => {}
            Err(error) if error.kind() == io::ErrorKind::NotFound => {
                target["missingRoot"] = json!(true);
            }
            _ => return Err(invalid("recovery component directory")),
        }
        for name in ["component.json", "package.json"] {
            proof::read(&path.join(name), proofs)?;
        }
    }
    Ok(())
}

fn select(context: &Value, pending: &Value, request: &Prepare) -> io::Result<(Vec<Value>, Value)> {
    let targets = context["targets"].as_array().ok_or_else(|| invalid("recovery targets"))?;
    let rows = pending.as_array().ok_or_else(|| invalid("recovery pending"))?;
    if request.operation == Operation::LaneAbort {
        return Ok((targets.clone(), json!([])));
    }
    if request.options.pattern.is_none() {
        return pending_targets(targets, rows);
    }
    let mut selected = Vec::new();
    for target in targets {
        let identity = target["identity"].as_str().ok_or_else(|| invalid("recovery identity"))?;
        let marked = rows
            .iter()
            .any(|row| pending_id(row).as_deref() == Some(identity));
        let matches = matches_target(request, target, identity, marked);
        if !matches {
            continue;
        }
        if !marked {
            return Err(invalid("recovery component is not unresolved"));
        }
        selected.push(target.clone());
    }
    if selected.len() != 1 {
        return Err(invalid("recovery unresolved selection empty"));
    }
    let remaining = rows
        .iter()
        .filter(|row| {
            !selected
                .iter()
                .any(|target| pending_id(row).as_deref() == target["identity"].as_str())
        })
        .cloned()
        .collect::<Vec<_>>();
    Ok((selected, json!(remaining)))
}
fn pending_targets(targets: &[Value], rows: &[Value]) -> io::Result<(Vec<Value>, Value)> {
    if rows.is_empty() {
        return Err(invalid("recovery unresolved selection empty"));
    }
    let mut seen = std::collections::HashSet::new();
    let selected = rows
        .iter()
        .map(|row| {
            let identity = pending_id(row).ok_or_else(|| invalid("recovery pending identity"))?;
            if !seen.insert(identity.clone()) {
                return Err(invalid("recovery duplicate pending identity"));
            }
            targets
                .iter()
                .find(|target| target["identity"] == identity)
                .cloned()
                .ok_or_else(|| invalid("recovery unresolved component outside workspace"))
        })
        .collect::<io::Result<Vec<_>>>()?;
    Ok((selected, json!([])))
}
fn validate_pending_configuration(
    request: &Prepare,
    targets: &[Value],
    pending: &Value,
) -> io::Result<()> {
    if request.operation == Operation::LaneAbort {
        return Ok(());
    }
    if request.root.join("merge-conflict").try_exists()? {
        return Err(invalid("recovery pending configuration conflict"));
    }
    for row in pending.as_array().ok_or_else(|| invalid("recovery pending records"))? {
        let selected = targets
            .iter()
            .any(|target| pending_id(row).as_deref() == target["identity"].as_str());
        if selected
            && !row["mergedConfig"].is_null()
            && !row["mergedConfig"].as_object().is_some_and(serde_json::Map::is_empty)
        {
            return Err(invalid("recovery pending merged configuration"));
        }
    }
    Ok(())
}
fn matches_target(request: &Prepare, target: &Value, identity: &str, marked: bool) -> bool {
    request.options.pattern
        .as_ref()
        .map_or(marked, |pattern| {
            identity == pattern
                || identity
                    .split_once('/')
                    .is_some_and(|(_, name)| name == pattern)
                || target["directory"] == *pattern
        })
}
fn pending_id(row: &Value) -> Option<String> {
    Some(format!("{}/{}", row["id"]["scope"].as_str()?, row["id"]["name"].as_str()?))
}
#[cfg(test)]
mod tests;

mod guards;
