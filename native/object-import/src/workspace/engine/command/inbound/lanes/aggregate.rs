//! Fetch main first, then lanes, retaining the published lane-first result order.
use super::{
    Prepare, Retained, State, Target, command_import, invalid, merge_remote, receipt, select,
};
use serde_json::{Value, json};
use std::{collections::HashMap, io};

pub(super) fn prepare(input: &Prepare, state: &mut State) -> io::Result<(usize, Value)> {
    let mut selection = select(input, None)?;
    let main = super::super::bitmap_targets(&input.root)?;
    let mut import = connected(input, &main, &mut selection)?;
    import.prepare_main_fetch(&input.root, &main, input.options.all_history)?;
    let main_receipt = group(input, &main, &import)?;
    let mut groups = vec![import.progress.len()];
    let mut targets = Vec::new();
    let mut lane_receipts = Vec::new();
    for lane in &selection.lanes {
        let before = snapshot(&import);
        let (lane_targets, counts) =
            super::receive_lanes(input, std::slice::from_ref(lane), &mut import)?;
        let mut receipt = group(input, &lane_targets, &import)?;
        adjust(&mut receipt, &before)?;
        lane_receipts.push(receipt);
        groups.extend(counts);
        targets.extend(lane_targets);
    }
    targets.extend(main);
    lane_receipts.push(main_receipt);
    retain(input, state, import, &targets, &groups, &lane_receipts)
}

fn connected(
    input: &Prepare,
    main: &[Target],
    selection: &mut super::Selection,
) -> io::Result<command_import::PreparedImport> {
    let mut remotes = selection.virtual_remotes
        .drain(..)
        .map(|remote| (remote.scope.clone(), remote))
        .collect::<HashMap<_, _>>();
    for remote in super::super::remote::objects(input, main)? {
        merge_remote(&mut remotes, remote)?;
    }
    super::validate_virtual_bounds(&remotes)?;
    command_import::prepare_lane_with_virtual(
        &input.root,
        &input.global_remotes_file,
        &remotes.into_values().collect::<Vec<_>>(),
    )
}

fn group(
    input: &Prepare,
    targets: &[Target],
    import: &command_import::PreparedImport,
) -> io::Result<Value> {
    receipt(
        &input.root,
        targets,
        import,
        None,
        &super::super::ReceiptRoots { roots: targets, prefetched: &[], head_dependencies: false },
        "pending",
    )
}

fn snapshot(import: &command_import::PreparedImport) -> HashMap<String, Vec<String>> {
    import.overlay
        .models()
        .into_iter()
        .map(|model| {
            let id = format!(
                "{}/{}",
                model["scope"].as_str().map_or("", str::trim),
                model["name"].as_str().map_or("", str::trim),
            );
            let versions = model["versions"]
                .as_object()
                .into_iter()
                .chain(model["orphanedVersions"].as_object())
                .flat_map(serde_json::Map::keys)
                .cloned()
                .collect();
            (id, versions)
        })
        .collect()
}

fn adjust(receipt: &mut Value, before: &HashMap<String, Vec<String>>) -> io::Result<()> {
    for row in
        receipt["importDetails"].as_array_mut().ok_or_else(|| invalid("inbound group details"))?
    {
        let id = row["id"]
            .as_str()
            .map(str::trim)
            .filter(|id| !id.is_empty())
            .ok_or_else(|| invalid("inbound group identity"))?;
        let Some(previous) = before.get(id) else { continue };
        let versions =
            row["versions"].as_array_mut().ok_or_else(|| invalid("inbound group versions"))?;
        versions.retain(|version| {
            let Some(ver) = version.as_str().map(str::trim) else {
                return false;
            };
            !previous
                .iter()
                .any(|old| old.trim() == ver)
        });
        let empty = versions.is_empty();
        row["status"] = json!(if empty {
            "up to date"
        } else if previous.is_empty() {
            "added"
        } else {
            "updated"
        });
        if !row["versions"]
            .as_array()
            .is_some_and(|versions| versions.contains(&row["latestVersion"]))
        {
            row["latestVersion"] = Value::Null;
        }
    }
    Ok(())
}

fn retain(
    input: &Prepare,
    state: &mut State,
    import: command_import::PreparedImport,
    targets: &[Target],
    groups: &[usize],
    receipts: &[Value],
) -> io::Result<(usize, Value)> {
    state.sequence = state.sequence.wrapping_add(1);
    let token = format!("inbound-{}", state.sequence);
    let mut output = group(input, targets, &import)?;
    output["token"] = json!(token);
    for field in ["importedIds", "importDetails"] {
        output[field] = json!(
            receipts
                .iter()
                .flat_map(|receipt| receipt[field]
                    .as_array()
                    .into_iter()
                    .flatten()
                    .cloned())
                .collect::<Vec<_>>()
        );
    }
    output["mainFetch"] = json!(true);
    output["laneFetch"] = json!(true);
    output["laneGroups"] = json!(groups);
    let count = targets.len();
    state.inbound = Some(Retained {
        token,
        receipt: output.clone(),
        import,
        workspace: None,
        applied: false,
        pending: None,
        proofs: Vec::new(),
    });
    Ok((count, output))
}
