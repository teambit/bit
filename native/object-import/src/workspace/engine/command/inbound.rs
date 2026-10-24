//! Retained public inbound transfer. Prepare performs remote I/O and validates
//! the complete import without touching the user's repository; Apply publishes.

pub(in crate::workspace::engine) mod autosync;
pub(in crate::workspace::engine) mod dependents;
pub(in crate::workspace::engine) mod policy;
pub(in crate::workspace::engine) mod remote;
pub(in crate::workspace::engine) mod write_dependencies;

use super::{
    super::{client_status::config, invalid},
    State,
};
use crate::command_import::{self, Target};
use preparation::{finish, prepare_targets};
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
mod owned_writes;
mod preparation;
mod progress;
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

#[derive(Clone, Deserialize)]
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

#[derive(Clone, Deserialize)]
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

#[derive(Clone, Deserialize)]
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

#[derive(Clone, Deserialize)]
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
    #[serde(default)]
    adoption: Adoption,
}

#[derive(Default, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Adoption {
    #[serde(default)]
    track_only: bool,
    #[serde(default)]
    write_to_empty_dir: bool,
    #[serde(default)]
    write_deps: Option<String>,
}

#[derive(Default, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Dependents {
    #[serde(default)]
    enabled: bool,
    #[serde(default)]
    via: Vec<String>,
    #[serde(default)]
    silent: bool,
}

#[derive(Default, Clone, Deserialize)]
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
    #[serde(default)]
    dependents: Dependents,
}

/// `commandInboundList`: the remote listings of wildcard patterns, before
/// `commandInboundPrepare` imports the selected ids.
#[derive(Clone, Deserialize)]
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

#[derive(Clone, Deserialize)]
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

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(in crate::workspace::engine) struct Apply {
    token: String,
    #[serde(default)]
    omit_owned_write_receipts: bool,
}

pub(super) struct Retained {
    token: String,
    receipt: Value,
    import: command_import::PreparedImport,
    workspace: Option<write::Prepared>,
    applied: bool,
    pending: Option<dependents::Pending>,
    proofs: Vec<super::proof::Proof>,
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
    let (targets, import) = if dependents::needed(input)
        && !input.options.dependencies.import_dependencies
        && !input.options.dependencies.import_head_dependencies
    {
        (roots.clone(), command_import::prepare_lane(&input.root, &input.global_remotes_file)?)
    } else {
        prepare_targets(input, &roots)?
    };
    state.sequence = state.sequence.wrapping_add(1);
    let token = format!("inbound-{}", state.sequence);
    if dependents::needed(input) {
        return dependents::begin(input, roots, targets, import, state, token);
    }
    finish(input, &roots, &targets, import, state, token)
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
    validate_receipt_mode(input, state)?;
    let mut retained = state.inbound.take().ok_or_else(|| invalid("inbound owner missing"))?;
    if input.token != retained.token || retained.applied {
        return Err(invalid("inbound owner token"));
    }
    if let Some(workspace) = &retained.workspace {
        workspace.validate_policy()?;
    }
    super::proof::verify(&retained.proofs)?;
    if retained.pending.is_some() {
        return Err(invalid("inbound dependent graph incomplete"));
    }
    let deferred = retained.workspace.as_ref().is_some_and(write::Prepared::requires_dependencies);
    let writes = commit_inbound(&mut retained, input.omit_owned_write_receipts)?;
    let mut receipt = retained.receipt.clone();
    receipt["applied"] = json!(true);
    if let Some(writes) = writes {
        receipt["ownedWorkspaceWrites"] = json!(owned_writes::combine(writes)?);
    }
    if let Some(workspace) = &retained.workspace {
        receipt["bitmapProof"] = workspace.published_bitmap_proof()?;
    }
    if deferred {
        receipt["requiresWriteDependencies"] = json!(true);
        let mut retained = retained;
        retained.applied = true;
        retained.receipt = receipt.clone();
        state.inbound = Some(retained);
    }
    let count = receipt["importedIds"].as_array().map_or(0, Vec::len);
    Ok((count, receipt))
}

fn validate_receipt_mode(input: &Apply, state: &State) -> io::Result<()> {
    if input.omit_owned_write_receipts {
        let retained = state.inbound.as_ref().ok_or_else(|| invalid("inbound owner missing"))?;
        if retained.receipt["laneImport"] != true || retained.workspace.is_some() {
            return Err(invalid("inbound write receipts required"));
        }
    }
    Ok(())
}

fn commit_inbound(retained: &mut Retained, omit_receipts: bool) -> io::Result<Option<Vec<Value>>> {
    let mut writes = if omit_receipts {
        retained.import.commit_retained()?;
        None
    } else {
        Some(retained.import.commit_with_receipts()?.1)
    };
    if let Some(workspace) = &retained.workspace {
        workspace.commit()?;
        if let Some(writes) = &mut writes {
            writes.extend(workspace.published_write_receipts()?);
        }
    }
    Ok(writes)
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

pub(in crate::workspace::engine) fn local_preflight(input: &Prepare) -> io::Result<(usize, Value)> {
    validation::local(input)?;
    if input.options.objects_only || input.options.lanes {
        return Ok((0, json!({"eligible":true})));
    }
    let targets = if input.ids.is_empty() {
        bitmap_targets(&input.root)?
    } else {
        input.ids
            .iter()
            .filter(|id| !id.contains('*'))
            .map(|id| requested_target(id))
            .collect::<io::Result<Vec<_>>>()?
    };
    write::preflight(&input.root, &targets, preparation::write_options(input, false))?;
    Ok((targets.len(), json!({"eligible":true})))
}
