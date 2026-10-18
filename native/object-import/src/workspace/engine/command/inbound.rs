//! Retained public inbound transfer. Prepare performs remote I/O and validates
//! the complete import without touching the user's repository; Apply publishes.

pub(in crate::workspace::engine) mod autosync;
pub(in crate::workspace::engine) mod policy;

use super::{
    super::{client_status::config, invalid},
    State,
};
use crate::command_import::{self, Target};
use selection::{bitmap_targets, requested_target};
use serde::Deserialize;
use serde_json::{Value, json};
use std::{
    io,
    path::{Path, PathBuf},
};
mod dependencies;
mod details;
mod lane_workspace;
mod lanes;
mod progress;
mod remote;
mod selection;
mod validation;
mod write;

/// Reuse inbound configuration and authentication without persisting recovery probes.
pub fn recovery_remote_connection(
    root: &Path,
    home: &Path,
    transport: &Value,
) -> io::Result<(bit_client_transfer::remotes::Remotes, bit_client_transfer::http::Network)> {
    let transport = serde_json::from_value(transport.clone()).map_err(io::Error::other)?;
    remote::recovery_connection(root, home, &transport)
}

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
    #[serde(flatten)]
    resolution: Resolution,
    #[serde(flatten)]
    dependencies: Traversal,
    lanes: bool,
    components: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Resolution {
    #[serde(default)]
    recovery_local: bool,
    #[serde(default)]
    override_existing: bool,
    #[serde(default)]
    merge_strategy: Option<String>,
    #[serde(default)]
    path: Option<String>,
}

#[derive(Default, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Traversal {
    #[serde(default)]
    import_dependencies: bool,
    #[serde(default)]
    fetch_deps: bool,
    #[serde(default)]
    import_head_dependencies: bool,
    #[serde(default)]
    dependencies_depth: Option<usize>,
}

/// `commandInboundList`: the remote listings of wildcard patterns, before
/// `commandInboundPrepare` imports the selected ids.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(in crate::workspace::engine) struct List {
    root: PathBuf,
    /// `<scope>/<namespaces with wildcards>`.
    patterns: Vec<String>,
    #[serde(default)]
    lane_only: bool,
    #[serde(default)]
    fork_order: bool,
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

struct ReceiptRoots<'a> {
    roots: &'a [Target],
    prefetched: &'a [Target],
    head_dependencies: bool,
}

pub(in crate::workspace::engine) fn prepare(
    input: &Prepare,
    state: &mut State,
) -> io::Result<(usize, Value)> {
    state.inbound = None;
    validation::validate(input)?;
    if input.options.lanes {
        return lanes::prepare(input, state);
    }
    let roots = targets(input)?;
    let (targets, mut import) = prepare_targets(input, &roots)?;
    let workspace = prepare_workspace(input, &targets, &mut import)?;
    state.sequence = state.sequence.wrapping_add(1);
    let token = format!("inbound-{}", state.sequence);
    let mut receipt = if matches!(input.operation.as_str(), "status" | "diff") {
        json!({"token":token,"importedIds":[],"progress":[],"refreshCount":import.main_refresh.count,"refreshObjects":import.main_refresh.objects})
    } else {
        let prefetched = if input.options.dependencies.dependencies_depth.is_some() {
            roots.as_slice()
        } else {
            &[]
        };
        receipt(
            &input.root,
            &targets,
            &import,
            workspace.as_ref(),
            &ReceiptRoots {
                roots: &roots,
                prefetched,
                head_dependencies: input.options.dependencies.import_head_dependencies,
            },
            &token,
        )?
    };
    if let Some(policy) = workspace.as_ref().and_then(write::Prepared::policy_input) {
        receipt["checkoutPolicyPreparation"] = policy.clone();
    }
    if let Some(lane) = remote::active_lane(&input.root)? {
        receipt["currentLane"] = json!(format!("{}/{}", lane.scope, lane.name));
    }
    let count = targets.len();
    state.inbound = Some(Retained { token, receipt: receipt.clone(), import, workspace });
    Ok((count, receipt))
}

fn prepare_targets(
    input: &Prepare,
    roots: &[Target],
) -> io::Result<(Vec<Target>, command_import::PreparedImport)> {
    if input.options.resolution.recovery_local {
        let initial = prepare_recovery(input, roots)?;
        let targets = dependencies::expand(input, roots, &initial)?;
        if targets.len() == roots.len() {
            return Ok((targets, initial));
        }
        let imported = prepare_recovery(input, &targets)?;
        return Ok((targets, imported));
    }
    if input.operation == "import"
        && let Some(lane) = remote::active_lane(&input.root)?
    {
        return lane_workspace::prepare(input, roots, &lane);
    }
    let virtual_remotes = remote::objects(input, roots)?;
    let initial = prepare_import(input, roots, &virtual_remotes)?;
    let targets = dependencies::expand(input, roots, &initial)?;
    if targets.len() == roots.len() {
        return Ok((targets, initial));
    }
    let virtual_remotes = remote::objects(input, &targets)?;
    let import = prepare_import(input, &targets, &virtual_remotes)?;
    Ok((targets, import))
}

fn prepare_workspace(
    input: &Prepare,
    targets: &[Target],
    import: &mut command_import::PreparedImport,
) -> io::Result<Option<write::Prepared>> {
    if input.options.objects_only {
        return Ok(None);
    }
    write::prepare(
        &input.root,
        targets,
        import,
        input.bitmap_history_file_id.as_deref(),
        write::Options {
            override_existing: input.options.resolution.override_existing,
            path: input.options.resolution.path.as_deref(),
            install_requested: !input.options.skip_dependency_installation,
            merge_strategy: input.options.resolution.merge_strategy.as_deref(),
        },
    )
    .map(Some)
}

fn prepare_import(
    input: &Prepare,
    targets: &[Target],
    virtual_remotes: &[command_import::VirtualRemote],
) -> io::Result<command_import::PreparedImport> {
    if input.operation == "diff" {
        let mut imported = command_import::prepare_lane_with_virtual(
            &input.root,
            &input.global_remotes_file,
            virtual_remotes,
        )?;
        imported.prepare_diff_versions(targets)?;
        return Ok(imported);
    }
    if input.operation == "status" {
        command_import::prepare_status_with_virtual(
            &input.root,
            &input.global_remotes_file,
            targets,
            virtual_remotes,
        )
    } else {
        command_import::prepare_inbound_with_virtual(
            &input.root,
            &input.global_remotes_file,
            targets,
            virtual_remotes,
            input.options.all_history,
            input.options.dependencies.fetch_deps,
        )
    }
}

fn receipt(
    root: &Path,
    targets: &[Target],
    import: &command_import::PreparedImport,
    workspace: Option<&write::Prepared>,
    selection: &ReceiptRoots<'_>,
    token: &str,
) -> io::Result<Value> {
    let imported_ids = targets
        .iter()
        .map(|target| imported_identity(root, target, import))
        .collect::<io::Result<Vec<_>>>()?;
    let details = details::details(root, targets, import, workspace, selection.prefetched)?;
    let progress = progress::rows(
        import,
        selection.roots,
        !selection.prefetched.is_empty(),
        selection.head_dependencies,
    );
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
    if let Some(workspace) = &retained.workspace {
        workspace.validate_policy()?;
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

fn targets(input: &Prepare) -> io::Result<Vec<Target>> {
    if input.ids.is_empty() {
        return bitmap_targets(&input.root);
    }
    input.ids
        .iter()
        .map(|id| requested_target(id))
        .collect()
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

/// The validated, unpublished object view retained by an inbound command.
pub(in crate::workspace::engine) fn overlay<'a>(
    state: &'a State,
    token: Option<&str>,
) -> io::Result<Option<&'a command_import::Overlay>> {
    let Some(token) = token else { return Ok(None) };
    let retained = state.inbound.as_ref().ok_or_else(|| invalid("diff inbound owner missing"))?;
    if token != retained.token {
        return Err(invalid("diff inbound owner token"));
    }
    retained.import.validate()?;
    Ok(Some(&retained.import.overlay))
}

fn prepare_recovery(
    input: &Prepare,
    targets: &[Target],
) -> io::Result<command_import::PreparedImport> {
    command_import::prepare_recovery_with_virtual(
        &input.root,
        &input.global_remotes_file,
        targets,
        |requested| remote::objects(input, requested),
    )
}
