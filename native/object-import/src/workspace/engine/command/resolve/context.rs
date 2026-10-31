#[cfg(test)]
mod tests;
use super::{
    super::{Record, State, history, input, invalid, proof, recovery, repository},
    Prepare, Retained, selection,
};
use crate::{
    command_import,
    workspace::engine::{client_status::config, status_context},
};
use serde_json::{Value, json};
use std::io;

pub(super) fn prepare(
    request: &Prepare,
    state: &mut State,
    pool: &rayon::ThreadPool,
) -> io::Result<Retained> {
    validate_request(request)?;
    let mut proofs = control_proofs(request)?;
    let (mut context, imported) = metadata(request, pool)?;
    context["callbackLifecycle"] = json!(request.options.callback_lifecycle);
    let ordinary: input::Prepare = serde_json::from_value(json!({"root":request.root,"home":request.home,
        "globalRemotesFile":request.global_remotes_file,"operation":"merge","options":{"skipDependencyInstallation":true,"pattern":request.options.pattern,"message":request.options.message},"dependencyGrammar":request.dependency_grammar})).map_err(io::Error::other)?;
    if request.ordinary_tag
        && !request.tag_options.as_ref().is_some_and(|options| options.soft)
        && !context["lane"]["current"].is_null()
    {
        return Err(invalid("tag is only supported on main"));
    }
    load_models(request, pool, &mut context, &imported)?;
    super::super::setup::component_controls(&ordinary, &context, &mut proofs)?;
    validate_extensions(&context)?;
    let (targets, pending, selected) = selection_state(request, &mut context)?;
    let mut repository = repository::Repository::new(&request.root, Some(imported));
    bind_models(&context, &mut repository)?;
    context["resolveIssueHeads"] = super::issue_heads::capture(&context, &mut repository)?;
    super::super::setup::validate_licenses(&context, &mut repository)?;
    proof::verify(&proofs)?;
    let token = token(state)?;
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
    Ok(initial(record, pending, selected, request))
}

fn selection_state(
    request: &Prepare,
    context: &mut Value,
) -> io::Result<(Vec<Value>, Vec<Value>, Vec<String>)> {
    let pending = pending_rows(request)?;
    let snapshot = request.ordinary_snap || request.options.callback_lifecycle;
    pending_configuration(context, &pending, snapshot)?;
    let targets = context["targets"]
        .as_array()
        .ok_or_else(|| invalid("resolve targets"))?
        .clone();
    let selected = if request.ordinary_snap {
        Vec::new()
    } else {
        selection::select(&targets, &pending, None)?
    };
    Ok((targets, pending, selected))
}

fn initial(
    record: Record,
    pending: Vec<Value>,
    selected: Vec<String>,
    request: &Prepare,
) -> Retained {
    let finalized = super::publication::Phase::Pending(super::refresh::Callbacks::default());
    let snap = request.ordinary_snap.then(|| request.options.clone());
    Retained {
        record,
        pending,
        selected,
        materials: Vec::new(),
        result: Value::Null,
        finalized,
        snap,
        tag: request.tag_options.clone(),
    }
}

fn pending_rows(request: &Prepare) -> io::Result<Vec<Value>> {
    let path = crate::scope_path(&request.root).join("unmerged.json");
    if request.ordinary_snap && !path.try_exists()? {
        return Ok(Vec::new());
    }
    config::document(&path)?
        .as_array()
        .cloned()
        .ok_or_else(|| invalid("resolve pending list"))
}

fn metadata(
    request: &Prepare,
    pool: &rayon::ThreadPool,
) -> io::Result<(Value, command_import::PreparedImport)> {
    let bitmap = config::document(&request.root.join(".bitmap"))?;
    let workspace = if request.ordinary_snap || request.options.callback_lifecycle {
        crate::effective_workspace_configuration(&request.root, &request.home)?
    } else {
        config::document(&request.root.join("workspace.jsonc"))?
    };
    let settings = config::configuration_value(&request.root, &workspace, true)?;
    let (structural, configs) = if request.ordinary_snap || request.options.callback_lifecycle {
        recovery::bitmap::project_snapshot(&bitmap)?
    } else {
        recovery::bitmap::project(&bitmap)?
    };
    let status_req = status_context::Request {
        root: request.root.clone(),
        home: request.home.clone(),
        history: false,
    };
    let visible = super::super::lane_context::visibility::targets(&structural, &settings)?;
    let mut context = status_context::metadata_for_recovery(&status_req, pool, &settings, visible)?;
    context["workspace"] = workspace;
    if request.tag_options.as_ref().is_some_and(|options| options.persist) {
        bind_next_versions(&bitmap, &mut context)?;
    }
    attach_configuration(request, &mut context, &configs)?;
    filter_pending_tag_targets(request, &mut context)?;
    let imported = load_lane(request, &bitmap, &mut context)?;
    Ok((context, imported))
}

fn filter_pending_tag_targets(request: &Prepare, context: &mut Value) -> io::Result<()> {
    if request.tag_options
        .as_ref()
        .is_some_and(|options| options.soft || options.persist)
    {
        let targets =
            context["targets"].as_array_mut().ok_or_else(|| invalid("snapshot targets"))?;
        targets.retain(|row| {
            row["locallyRemoved"] != true && !config::is_config_removed(&row["bitmapConfig"])
        });
    }
    Ok(())
}

fn attach_configuration(
    request: &Prepare,
    context: &mut Value,
    configs: &std::collections::HashMap<String, Value>,
) -> io::Result<()> {
    for target in context["targets"].as_array_mut().ok_or_else(|| invalid("resolve targets"))? {
        if let Some(config) = target["directory"]
            .as_str()
            .and_then(|path| configs.get(path))
        {
            target["bitmapConfig"] = config.clone();
            if request.ordinary_snap {
                target["componentConfig"] = config.clone();
            }
        }
    }
    Ok(())
}

fn bind_next_versions(bitmap: &Value, context: &mut Value) -> io::Result<()> {
    let entries = bitmap.as_object().ok_or_else(|| invalid("tag persist bitmap"))?;
    for target in context["targets"].as_array_mut().ok_or_else(|| invalid("tag persist targets"))? {
        let dir = target["directory"].as_str().ok_or_else(|| invalid("tag persist directory"))?;
        let matches = |entry: &&Value| {
            entry["rootDir"]
                .as_str()
                .map(|raw| {
                    raw.strip_prefix("./")
                        .unwrap_or(raw)
                        .trim_end_matches('/')
                })
                == Some(dir)
        };
        let entry = entries
            .values()
            .find(matches)
            .ok_or_else(|| invalid("tag persist bitmap entry"))?;
        target["nextVersion"] = entry["nextVersion"].clone();
    }
    Ok(())
}

fn validate_request(request: &Prepare) -> io::Result<()> {
    if request.ordinary_tag != request.tag_options.is_some() {
        return Err(invalid("unexpected tag options"));
    }
    for path in [&request.root, &request.home, &request.global_remotes_file] {
        crate::workspace::engine::path(path)?;
    }
    if !request.ordinary_snap
        && (request.options.unmodified
            || request.options.unmerged
            || request.options.skip_auto_snap)
    {
        return Err(invalid("resolve ordinary snapshot flags"));
    }
    if request.options.build
        || !(request.ordinary_snap || request.options.callback_lifecycle)
            && (request.home.join(".bitrc.jsonc").try_exists()?
                || request.root.join(".bitTmp").try_exists()?
                || request.root.join("merge-conflict").try_exists()?)
    {
        return Err(invalid("resolve requires canonical lifecycle"));
    }
    Ok(())
}

fn control_proofs(request: &Prepare) -> io::Result<Vec<proof::Proof>> {
    let mut proofs = Vec::new();
    for name in [".bitmap", "workspace.jsonc", "package.json", "merge-conflict"] {
        proof::read(&request.root.join(name), &mut proofs)?;
    }
    let scope = crate::scope_path(&request.root);
    for name in ["scope.json", "index.json", "unmerged.json", "staged-snaps"] {
        proof::read(&scope.join(name), &mut proofs)?;
    }
    if request.ordinary_snap {
        proof::read(&request.home.join(".bitrc.jsonc"), &mut proofs)?;
    }
    if let Some(file) =
        request.tag_options.as_ref().and_then(|options| options.versions_file.as_ref())
    {
        let receipt =
            file.get("readProof").ok_or_else(|| invalid("tag versions file proof missing"))?;
        proofs.push(serde_json::from_value(receipt.clone()).map_err(io::Error::other)?);
    }
    Ok(proofs)
}

fn load_lane(
    request: &Prepare,
    bitmap: &Value,
    context: &mut Value,
) -> io::Result<command_import::PreparedImport> {
    let mut imported = command_import::prepare_lane(&request.root, &request.global_remotes_file)?;
    if let Some(header) = bitmap.get("_bit_lane") {
        let id = command_import::lane::lane_index_id(header)?;
        let lane =
            imported.load_lane(&id)?.ok_or_else(|| invalid("resolve current Lane absent"))?;
        let entries = command_import::lane::entries(&lane.value)?;
        context["lane"] = json!({"currentId":id,"current":lane,"targets":entries.iter().map(|entry| json!({"identity":entry.identity,"head":entry.head,"currentHead":entry.head,"hidden":entry.hidden})).collect::<Vec<_>>(),"additions":[]});
    }
    Ok(imported)
}

fn token(state: &mut State) -> io::Result<String> {
    state.sequence = state.sequence.checked_add(1).ok_or_else(|| invalid("resolve sequence"))?;
    Ok(crate::workspace::engine::hash(
        format!("resolve:{}:{}", std::process::id(), state.sequence).as_bytes(),
    ))
}

fn validate_extensions(context: &Value) -> io::Result<()> {
    for version in context["versions"].as_array().ok_or_else(|| invalid("resolve versions"))? {
        let mut seen = std::collections::HashSet::new();
        for row in version[1]["extensions"]
            .as_array()
            .into_iter()
            .flatten()
        {
            if !seen.insert(extension_identity(row)?) {
                return Err(invalid("resolve duplicate extension identity"));
            }
        }
    }
    Ok(())
}

fn extension_identity(row: &Value) -> io::Result<String> {
    [row.get("name"), row.get("legacyId"), row.get("extensionId"), row.get("id")]
        .into_iter()
        .flatten()
        .find(|val| {
            val.as_str()
                .is_some_and(|text| !text.trim().is_empty())
                || val
                    .as_object()
                    .is_some_and(|map| !map.is_empty())
        })
        .map(ToString::to_string)
        .ok_or_else(|| invalid("resolve extension identity"))
}

fn pending_configuration(context: &mut Value, pending: &[Value], snapshot: bool) -> io::Result<()> {
    for target in context["targets"].as_array_mut().ok_or_else(|| invalid("resolve targets"))? {
        target["resolveConfig"] = json!(true);
        let id = target["identity"].as_str().map(str::trim);
        if let Some(row) = pending
            .iter()
            .find(|row| selection::identity(&row["id"]).ok().as_deref() == id)
            && let Some(config) = row
                .get("mergedConfig")
                .filter(|value| !value.is_null())
        {
            if snapshot {
                validate_snapshot_config(config)?;
            } else {
                validate_pending_config(config)?;
            }
            target["mergedConfig"] = config.clone();
        }
    }
    Ok(())
}

fn validate_snapshot_config(config: &Value) -> io::Result<()> {
    let rows = config.as_object().ok_or_else(|| invalid("snapshot merged configuration"))?;
    if rows
        .iter()
        .any(|(name, value)| {
            name.trim()
                .split_once('/')
                .is_none_or(|(scope, part)| scope.trim().is_empty() || part.trim().is_empty())
                || (!value.is_object() && value != "-")
        })
    {
        return Err(invalid("snapshot merged aspect configuration"));
    }
    Ok(())
}

fn validate_pending_config(config: &Value) -> io::Result<()> {
    let rows = config.as_object().ok_or_else(|| invalid("resolve merged configuration"))?;
    for (name, value) in rows {
        let name = name.trim();
        let bare = name
            .split('@')
            .next()
            .unwrap_or(name)
            .trim();
        let dependency_policy = bare == "teambit.dependencies/dependency-resolver"
            && value
                .as_object()
                .is_some_and(|row| row.keys().all(|key| key == "policy"));
        let removal = bare == "teambit.component/remove"
            && value
                .as_object()
                .is_some_and(|row| row.len() == 1 && row.get("removed") == Some(&json!(true)));
        if !dependency_policy && !removal {
            return Err(invalid("resolve custom merged configuration"));
        }
    }
    Ok(())
}

fn load_models(
    request: &Prepare,
    pool: &rayon::ThreadPool,
    context: &mut Value,
    imported: &command_import::PreparedImport,
) -> io::Result<()> {
    let mut targets = context["targets"]
        .as_array()
        .ok_or_else(|| invalid("resolve targets"))?
        .iter()
        .map(|target| json!({"identity":target["identity"],"version":target["version"]}))
        .collect::<Vec<_>>();
    for target in context["lane"]["targets"]
        .as_array()
        .into_iter()
        .flatten()
    {
        let target = json!({"identity":target["identity"],"version":target["head"]});
        if !targets.contains(&target) {
            targets.push(target);
        }
    }
    let raw = json!({"root":request.root,"history":false,"includeHeads":false,"targets":targets});
    let input = serde_json::from_value(raw).map_err(io::Error::other)?;
    let (_, models) =
        crate::workspace::engine::status_models::read_overlay(&input, pool, &imported.overlay)?;
    let models = models.as_object().ok_or_else(|| invalid("resolve models"))?;
    context
        .as_object_mut()
        .ok_or_else(|| invalid("resolve context"))?
        .extend(models.clone());
    Ok(())
}

fn bind_models(context: &Value, repository: &mut repository::Repository) -> io::Result<()> {
    for model in context["models"].as_array().ok_or_else(|| invalid("resolve models"))? {
        let name = model["name"]
            .as_str()
            .map(str::trim)
            .filter(|name| !name.is_empty());
        let name = name.ok_or_else(|| invalid("resolve model name"))?;
        let scope = model["scope"]
            .as_str()
            .map(str::trim)
            .filter(|scope| !scope.is_empty());
        let identity = scope.map_or_else(|| name.to_owned(), |scope| format!("{scope}/{name}"));
        if repository.read_component(&identity)? != *model {
            return Err(invalid("resolve model changed"));
        }
    }
    for version in context["versions"].as_array().ok_or_else(|| invalid("resolve versions"))? {
        let hash = version[0]
            .as_str()
            .map(str::trim)
            .filter(|hash| !hash.is_empty());
        let hash = hash.ok_or_else(|| invalid("resolve version reference"))?;
        if repository.read(hash, "Version")? != version[1] {
            return Err(invalid("resolve version changed"));
        }
    }
    repository.validate()
}
