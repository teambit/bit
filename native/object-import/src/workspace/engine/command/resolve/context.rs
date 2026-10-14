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
    let ordinary: input::Prepare = serde_json::from_value(json!({"root":request.root,"home":request.home,
        "globalRemotesFile":request.global_remotes_file,"operation":"merge","options":{"skipDependencyInstallation":true,"pattern":request.options.pattern,"message":request.options.message},"dependencyGrammar":request.dependency_grammar})).map_err(io::Error::other)?;
    if request.ordinary_tag && !context["lane"]["current"].is_null() {
        return Err(invalid("tag is only supported on main"));
    }
    load_models(request, pool, &mut context, &imported)?;
    super::super::setup::component_controls(&ordinary, &context, &mut proofs)?;
    validate_extensions(&context)?;
    let pending = pending_rows(request)?;
    pending_configuration(&mut context, &pending)?;
    let targets = context["targets"]
        .as_array()
        .ok_or_else(|| invalid("resolve targets"))?
        .clone();
    let selected = if request.ordinary_snap {
        Vec::new()
    } else {
        selection::select(&targets, &pending, None)?
    };
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

fn initial(
    record: Record,
    pending: Vec<Value>,
    selected: Vec<String>,
    request: &Prepare,
) -> Retained {
    Retained {
        record,
        pending,
        selected,
        materials: Vec::new(),
        result: Value::Null,
        finalized: super::publication::Phase::Pending,
        snap: request.ordinary_snap.then(|| request.options.clone()),
        tag: request.tag_options.clone(),
    }
}

fn pending_rows(request: &Prepare) -> io::Result<Vec<Value>> {
    let path = request.root.join(".bit/unmerged.json");
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
    if request.ordinary_snap
        && bitmap
            .as_object()
            .is_some_and(|rows| {
                rows.values()
                    .any(|row| row["localOnly"] == true)
            })
    {
        return Err(invalid("snap local-only selection requires canonical policy"));
    }
    let settings = config::configuration_for_command(&request.root, true)?;
    let (structural, configs) = recovery::bitmap::project(&bitmap)?;
    let targets = super::super::lane_context::visibility::targets(&structural, &settings)?;
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
    for target in context["targets"].as_array_mut().ok_or_else(|| invalid("resolve targets"))? {
        if let Some(config) = target["directory"]
            .as_str()
            .and_then(|path| configs.get(path))
        {
            target["bitmapConfig"] = config.clone();
        }
    }
    let imported = load_lane(request, &bitmap, &mut context)?;
    Ok((context, imported))
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
        || request.home.join(".bitrc.jsonc").try_exists()?
        || request.root.join(".bitTmp").try_exists()?
        || request.root.join("merge-conflict").try_exists()?
    {
        return Err(invalid("resolve requires canonical lifecycle"));
    }
    Ok(())
}

fn control_proofs(request: &Prepare) -> io::Result<Vec<proof::Proof>> {
    let mut proofs = Vec::new();
    for name in [
        ".bitmap",
        "workspace.jsonc",
        "package.json",
        ".bit/scope.json",
        ".bit/index.json",
        ".bit/unmerged.json",
        ".bit/staged-snaps",
        "merge-conflict",
    ] {
        proof::read(&request.root.join(name), &mut proofs)?;
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
        let id = serde_json::from_value::<command_import::lane::Id>(header["id"].clone())
            .map_err(io::Error::other)?;
        let lane =
            imported.load_lane(&id)?.ok_or_else(|| invalid("resolve current Lane absent"))?;
        let entries = command_import::lane::entries(&lane.value)?;
        context["lane"] = json!({"currentId":id,"current":lane,"targets":entries.iter().map(|entry| json!({"identity":entry.identity,"head":entry.head,"currentHead":entry.head,"hidden":entry.hidden})).collect::<Vec<_>>(),"additions":[]});
    }
    Ok(imported)
}

fn token(state: &mut State) -> io::Result<String> {
    state.sequence = state.sequence.checked_add(1).ok_or_else(|| invalid("resolve sequence"))?;
    let token = crate::workspace::engine::hash(
        format!("resolve:{}:{}", std::process::id(), state.sequence).as_bytes(),
    );
    Ok(token)
}

fn validate_extensions(context: &Value) -> io::Result<()> {
    for version in context["versions"].as_array().ok_or_else(|| invalid("resolve versions"))? {
        let mut seen = std::collections::HashSet::new();
        for row in version[1]["extensions"]
            .as_array()
            .into_iter()
            .flatten()
        {
            let identity = row
                .get("name")
                .or_else(|| row.get("extensionId"))
                .ok_or_else(|| invalid("resolve extension identity"))?;
            if !seen.insert(identity.to_string()) {
                return Err(invalid("resolve duplicate extension identity"));
            }
        }
    }
    Ok(())
}

fn pending_configuration(context: &mut Value, pending: &[Value]) -> io::Result<()> {
    for target in context["targets"].as_array_mut().ok_or_else(|| invalid("resolve targets"))? {
        target["resolveConfig"] = json!(true);
        if let Some(row) = pending
            .iter()
            .find(|row| {
                selection::identity(&row["id"]).ok().as_deref() == target["identity"].as_str()
            })
            && let Some(config) = row
                .get("mergedConfig")
                .filter(|value| !value.is_null())
        {
            validate_pending_config(config)?;
            target["mergedConfig"] = config.clone();
        }
    }
    Ok(())
}

fn validate_pending_config(config: &Value) -> io::Result<()> {
    if !config.is_object() {
        return Err(invalid("resolve merged configuration"));
    }
    for (name, value) in config.as_object().unwrap() {
        if name != "teambit.dependencies/dependency-resolver"
            || !value.is_object()
            || value
                .as_object()
                .unwrap()
                .keys()
                .any(|key| key != "policy")
        {
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
    let input = serde_json::from_value(
        json!({"root":request.root,"history":false,"includeHeads":false,"targets":targets}),
    )
    .map_err(io::Error::other)?;
    let (_, models) =
        crate::workspace::engine::status_models::read_overlay(&input, pool, &imported.overlay)?;
    context
        .as_object_mut()
        .ok_or_else(|| invalid("resolve context"))?
        .extend(
            models
                .as_object()
                .ok_or_else(|| invalid("resolve models"))?
                .clone(),
        );
    Ok(())
}

fn bind_models(context: &Value, repository: &mut repository::Repository) -> io::Result<()> {
    for model in context["models"].as_array().ok_or_else(|| invalid("resolve models"))? {
        let name = model["name"].as_str().ok_or_else(|| invalid("resolve model name"))?;
        let identity = model["scope"]
            .as_str()
            .filter(|scope| !scope.is_empty())
            .map_or_else(|| name.to_owned(), |scope| format!("{scope}/{name}"));
        if repository.read(&crate::workspace::engine::hash(identity.as_bytes()), "Component")?
            != *model
        {
            return Err(invalid("resolve model changed"));
        }
    }
    for version in context["versions"].as_array().ok_or_else(|| invalid("resolve versions"))? {
        let hash = version[0].as_str().ok_or_else(|| invalid("resolve version reference"))?;
        if repository.read(hash, "Version")? != version[1] {
            return Err(invalid("resolve version changed"));
        }
    }
    repository.validate()
}

#[cfg(test)]
mod tests;
