//! Retained public inbound transfer. Prepare performs remote I/O and validates
//! the complete import without touching the user's repository; Apply publishes.

use super::{
    super::{client_status::config, invalid},
    State,
};
use crate::command_import::{self, Target};
use serde::Deserialize;
use serde_json::{Value, json};
use std::{
    io,
    path::{Path, PathBuf},
};
mod details;
mod lanes;
mod remote;
mod write;

#[cfg(test)]
mod protocol_tests;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(in crate::workspace::engine) struct Prepare {
    root: PathBuf,
    home: PathBuf,
    global_remotes_file: PathBuf,
    #[serde(default)]
    bitmap_history_file_id: Option<String>,
    operation: String,
    ids: Vec<String>,
    options: Options,
    #[serde(flatten)]
    transport: Transport,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(in crate::workspace::engine) struct Transport {
    global_config_dir: PathBuf,
    node_executable: PathBuf,
    /// The `@teambit/bit` package dir: a `resolverPath` resolves from its
    /// `@teambit/scope.remotes`, as in Bit.
    #[serde(default)]
    bit_dir: PathBuf,
    bit_version: String,
    #[serde(default)]
    token: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Options {
    objects_only: bool,
    all_history: bool,
    from_original_scope: bool,
    skip_dependency_installation: bool,
    #[serde(default)]
    override_existing: bool,
    #[serde(default)]
    path: Option<String>,
    lanes: bool,
    components: bool,
}

/// `commandInboundList`: the remote listings of wildcard patterns, before
/// `commandInboundPrepare` imports the selected ids.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(in crate::workspace::engine) struct List {
    root: PathBuf,
    /// `<scope>/<namespaces with wildcards>`.
    patterns: Vec<String>,
    #[serde(flatten)]
    transport: Transport,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(in crate::workspace::engine) struct RemoteLog {
    #[serde(default)]
    root: Option<PathBuf>,
    identity: String,
    #[serde(flatten)]
    transport: Transport,
}

pub(in crate::workspace::engine) fn remote_log(input: &RemoteLog) -> io::Result<(usize, Value)> {
    remote::log(input)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(in crate::workspace::engine) struct Apply {
    token: String,
}

pub(super) struct Retained {
    token: String,
    receipt: Value,
    import: command_import::PreparedImport,
    workspace: Option<write::Prepared>,
}

pub(in crate::workspace::engine) fn prepare(
    input: &Prepare,
    state: &mut State,
) -> io::Result<(usize, Value)> {
    state.inbound = None;
    validate(input)?;
    if input.options.lanes {
        return lanes::prepare(input, state);
    }
    let targets = targets(input)?;
    let virtual_remotes = remote::objects(input, &targets)?;
    let import = prepare_import(input, &targets, &virtual_remotes)?;
    let workspace = if input.options.objects_only {
        None
    } else {
        Some(write::prepare(
            &input.root,
            &targets,
            &import,
            input.bitmap_history_file_id.as_deref(),
            write::Options {
                override_existing: input.options.override_existing,
                path: input.options.path.as_deref(),
                install_requested: !input.options.skip_dependency_installation,
            },
        )?)
    };
    state.sequence = state.sequence.wrapping_add(1);
    let token = format!("inbound-{}", state.sequence);
    let receipt = if input.operation == "status" {
        json!({"token":token,"importedIds":[],"progress":[],"refreshCount":import.main_refresh.count,"refreshObjects":import.main_refresh.objects})
    } else {
        receipt(&input.root, &targets, &import, &token)?
    };
    let count = targets.len();
    state.inbound = Some(Retained { token, receipt: receipt.clone(), import, workspace });
    Ok((count, receipt))
}

fn prepare_import(
    input: &Prepare,
    targets: &[Target],
    virtual_remotes: &[command_import::VirtualRemote],
) -> io::Result<command_import::PreparedImport> {
    if input.operation == "status" {
        command_import::prepare_status_with_virtual(
            &input.root,
            &input.global_remotes_file,
            targets,
            virtual_remotes,
        )
    } else {
        command_import::prepare_with_virtual(
            &input.root,
            &input.global_remotes_file,
            targets,
            virtual_remotes,
        )
    }
}

fn receipt(
    root: &Path,
    targets: &[Target],
    import: &command_import::PreparedImport,
    token: &str,
) -> io::Result<Value> {
    let imported_ids = targets
        .iter()
        .map(|target| imported_identity(root, target, import))
        .collect::<io::Result<Vec<_>>>()?;
    let details = details::details(root, targets, import)?;
    let progress = import.progress
        .iter()
        .map(|row| {
            json!({
                "reason":row.reason,"ids":row.ids,
                "components":row.components.len(),"objects":row.objects.len(),
                "objectRequest":row.object_request,
            })
        })
        .collect::<Vec<_>>();
    Ok(json!({
        "token":token,"owner":"rust","importedIds":imported_ids,
        "importDetails":details,"progress":progress,
    }))
}

/// Each pattern with the components its remote lists, in the remote's order.
pub(in crate::workspace::engine) fn list(input: &List) -> io::Result<(usize, Value)> {
    for path in [&input.root, &input.transport.global_config_dir] {
        super::super::path(path)?;
    }
    if !input.transport.node_executable.is_absolute()
        || input.transport.bit_version.is_empty()
        || input.patterns.is_empty()
        || input.patterns.len() > 4096
    {
        return Err(invalid("inbound list requires canonical lifecycle"));
    }
    let lists = remote::list(input)?
        .into_iter()
        .map(|(pattern, listed)| {
            let components = listed
                .iter()
                .map(|component| json!({"id":component.id(),"deprecated":component.deprecated}))
                .collect::<Vec<_>>();
            json!({"pattern":pattern,"components":components})
        })
        .collect::<Vec<_>>();
    Ok((lists.len(), json!({ "lists": lists })))
}

pub(in crate::workspace::engine) fn apply(
    input: &Apply,
    state: &mut State,
) -> io::Result<(usize, Value)> {
    let retained = state.inbound.take().ok_or_else(|| invalid("inbound owner missing"))?;
    if input.token != retained.token {
        return Err(invalid("inbound owner token"));
    }
    retained.import.commit()?;
    if let Some(workspace) = retained.workspace {
        workspace.commit()?;
    }
    let mut receipt = retained.receipt;
    receipt["applied"] = json!(true);
    let count = receipt["importedIds"].as_array().map_or(0, Vec::len);
    Ok((count, receipt))
}

/// Compare the current lane with main using the retained remote import before
/// publishing it. The status command can still decline without changing scope.
pub(in crate::workspace::engine) fn lane_updates(
    input: &super::super::status_models::lane_updates::Request,
    state: &State,
    pool: &rayon::ThreadPool,
) -> io::Result<(usize, Value)> {
    let retained = state.inbound.as_ref().ok_or_else(|| invalid("status inbound owner missing"))?;
    if input.token != retained.token {
        return Err(invalid("status inbound owner token"));
    }
    super::super::status_models::lane_updates::read(input, &retained.import.overlay, pool)
}

fn validate(input: &Prepare) -> io::Result<()> {
    for path in
        [&input.root, &input.home, &input.global_remotes_file, &input.transport.global_config_dir]
    {
        super::super::path(path)?;
    }
    if !input.transport.node_executable.is_absolute()
        || input.transport.bit_version.is_empty()
        || input.ids.len() > 4096
    {
        return Err(invalid("inbound command requires canonical lifecycle"));
    }
    if input.options.from_original_scope || !valid_operation(input) {
        return Err(invalid("inbound command requires canonical lifecycle"));
    }
    validate_override(input)?;
    if input.options.lanes
        && (input.ids.is_empty() || input.ids.len() > 32 || input.options.all_history)
    {
        return Err(invalid("inbound lanes require explicit IDs"));
    }
    if !valid_write_mode(input) || input.root.join(".bitTmp").try_exists()? {
        return Err(invalid("inbound command requires canonical lifecycle"));
    }
    Ok(())
}
fn validate_override(input: &Prepare) -> io::Result<()> {
    if input.options.override_existing
        && (input.operation != "import"
            || input.options.objects_only
            || input.ids.is_empty())
    {
        return Err(invalid("inbound override requires explicit workspace import"));
    }
    if input.options.path.is_some()
        && (input.operation != "import"
            || input.options.objects_only
            || input.ids.len() != 1)
    {
        return Err(invalid("inbound path requires one explicit workspace import"));
    }
    Ok(())
}
fn valid_operation(input: &Prepare) -> bool {
    match input.operation.as_str() {
        "fetch" => {
            (input.options.components || input.options.lanes)
                && input.options.components != input.options.lanes
                && input.options.objects_only
        }
        "import" => !input.options.components,
        "status" => {
            input.options.objects_only
                && !input.options.components
                && !input.ids.is_empty()
                && (input.options.all_history != input.options.lanes)
        }
        _ => false,
    }
}
/// Objects-only imports write no bitmap history. A write keeps one; the caller
/// installs dependencies after publication unless they are skipped.
fn valid_write_mode(input: &Prepare) -> bool {
    if input.options.objects_only {
        !input.options.skip_dependency_installation
            && input.bitmap_history_file_id.is_none()
    } else {
        input.bitmap_history_file_id.is_some()
    }
}

fn targets(input: &Prepare) -> io::Result<Vec<Target>> {
    if input.ids.is_empty() {
        return bitmap_targets(&input.root);
    }
    input.ids
        .iter()
        .map(|id| requested_target(id))
        .collect()
}
fn bitmap_targets(root: &Path) -> io::Result<Vec<Target>> {
    let bitmap = config::document(&root.join(".bitmap"))?;
    let rows = bitmap.as_object().ok_or_else(|| invalid("inbound bitmap"))?;
    let mut targets = Vec::new();
    for (key, row) in rows {
        if key == "$schema-version" {
            continue;
        }
        let Some(scope) = row["scope"]
            .as_str()
            .filter(|scope| !scope.is_empty())
        else {
            continue;
        };
        let name = row["name"].as_str().ok_or_else(|| invalid("inbound bitmap name"))?;
        let version = row["version"].as_str().ok_or_else(|| invalid("inbound bitmap version"))?;
        targets.push(Target {
            scope: Some(scope.to_owned()),
            name: name.to_owned(),
            version: version.to_owned(),
        });
    }
    Ok(targets)
}
fn requested_target(id: &str) -> io::Result<Target> {
    let (scope, rest) = id.split_once('/').ok_or_else(|| invalid("inbound unscoped id"))?;
    let (name, version) = rest
        .rsplit_once('@')
        .unwrap_or((rest, "latest"));
    if scope.is_empty() || name.is_empty() || name.contains('*') || version.is_empty() {
        return Err(invalid("inbound unsupported id"));
    }
    Ok(Target { scope: Some(scope.to_owned()), name: name.to_owned(), version: version.to_owned() })
}

fn identity(target: &Target) -> io::Result<String> {
    let scope = target.scope.as_deref().ok_or_else(|| invalid("inbound scope"))?;
    Ok(format!("{scope}/{}@{}", target.name, target.version))
}

fn imported_identity(
    root: &Path,
    target: &Target,
    imported: &command_import::PreparedImport,
) -> io::Result<String> {
    let scope = target.scope.as_deref().ok_or_else(|| invalid("inbound target scope"))?;
    let model = details::model(root, imported, scope, &target.name)?;
    let version = if target.version == "latest" {
        details::head_as_tag_or_hash(model.as_ref())?
    } else {
        target.version.clone()
    };
    Ok(format!("{scope}/{}@{version}", target.name))
}
