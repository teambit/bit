//! Acquire selected objects and prepare their retained workspace publication.
use super::{
    Prepare, ReceiptRoots, Retained, State, Target, command_import, dependencies, lane_workspace,
    prepare_recovery, receipt, remote, write,
};
use serde_json::{Value, json};
use std::io;

pub(super) fn prepare_targets(
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

pub(super) fn prepare_workspace(
    input: &Prepare,
    targets: &[Target],
    import: &mut command_import::PreparedImport,
) -> io::Result<Option<write::Prepared>> {
    if input.options.objects_only {
        return Ok(None);
    }
    let options = write_options(input, import.post_write_bitmap_history());
    write::prepare(&input.root, targets, import, input.bitmap_history_file_id.as_deref(), options)
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
        let prepare = if super::dependents::needed(input) {
            command_import::prepare_graph_inbound_with_virtual
        } else {
            command_import::prepare_inbound_with_virtual
        };
        prepare(
            &input.root,
            &input.global_remotes_file,
            targets,
            virtual_remotes,
            input.options.all_history,
            input.options.dependencies.fetch_deps,
        )
    }
}

pub(super) fn finish(
    input: &Prepare,
    roots: &[Target],
    targets: &[Target],
    mut import: command_import::PreparedImport,
    state: &mut State,
    token: String,
) -> io::Result<(usize, Value)> {
    let workspace = prepare_workspace(input, targets, &mut import)?;
    let mut receipt = if matches!(input.operation.as_str(), "status" | "diff") {
        json!({"token":token,"importedIds":[],"progress":[],"refreshCount":import.main_refresh.count,"refreshObjects":import.main_refresh.objects})
    } else {
        let prefetched =
            if input.options.dependencies.dependencies_depth.is_some() { roots } else { &[] };
        receipt(
            &input.root,
            targets,
            &import,
            workspace.as_ref(),
            &ReceiptRoots {
                roots,
                prefetched,
                head_dependencies: input.options.dependencies.import_head_dependencies,
            },
            &token,
        )?
    };
    complete_receipt(input, workspace.as_ref(), &mut receipt)?;
    let count = targets.len();
    state.inbound = Some(Retained {
        token,
        receipt: receipt.clone(),
        import,
        workspace,
        applied: false,
        pending: None,
        proofs: Vec::new(),
    });
    Ok((count, receipt))
}

fn complete_receipt(
    input: &Prepare,
    workspace: Option<&write::Prepared>,
    receipt: &mut Value,
) -> io::Result<()> {
    if let Some(workspace) = &workspace {
        receipt["directoryWarnings"] = json!(workspace.directory_warnings());
        receipt["workspaceComponentOrder"] = json!(workspace.component_order());
    }
    if let Some(policy) = workspace.and_then(write::Prepared::policy_input) {
        receipt["checkoutPolicyPreparation"] = policy.clone();
    }
    if let Some(lane) = remote::active_lane(&input.root)? {
        receipt["currentLane"] = json!(format!("{}/{}", lane.scope, lane.name));
        if input.operation == "import" && input.ids.is_empty() && input.options.objects_only {
            receipt["laneObjectImport"] = json!(true);
        }
    }
    Ok(())
}

pub(super) fn write_options(
    input: &Prepare,
    post_write_bitmap_history: bool,
) -> write::Options<'_> {
    write::Options {
        override_existing: input.options.resolution.override_existing,
        path: input.options.resolution.path.as_deref(),
        merge_strategy: input.options.resolution.merge_strategy.as_deref(),
        track_only: input.options.resolution.adoption.track_only,
        write_to_empty_dir: input.options.resolution.adoption.write_to_empty_dir,
        write_deps: input.options.resolution.adoption.write_deps
            .as_deref()
            .filter(|value| !value.is_empty()),
        post_write_bitmap_history,
    }
}
