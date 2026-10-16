//! Multiple named lanes share one retained inbound publication.

use super::{Prepare, Retained, State, Target, identity, invalid, receipt, remote};
use crate::command_import::{self, VirtualRemote, lane};
use serde_json::{Value, json};
use std::{
    collections::{HashMap, HashSet},
    io,
    path::Path,
};

struct Selection {
    lanes: Vec<(lane::Id, Option<String>)>,
    virtual_remotes: Vec<VirtualRemote>,
}

/// Public `fetch <scope>/<lane> --lanes` for configured scopes. The
/// existing lane importer owns component closure and remote refs without
/// publishing the Lane object into the local index.
pub(super) fn prepare(input: &Prepare, state: &mut State) -> io::Result<(usize, Value)> {
    let selection = select(input)?;
    let mut import = if selection.virtual_remotes.is_empty() {
        command_import::prepare_lane(&input.root, &input.global_remotes_file)?
    } else {
        command_import::prepare_lane_with_virtual(
            &input.root,
            &input.global_remotes_file,
            &selection.virtual_remotes,
        )?
    };
    let (targets, groups) = receive_lanes(input, &selection.lanes, &mut import)?;
    state.sequence = state.sequence.wrapping_add(1);
    let token = format!("inbound-{}", state.sequence);
    let mut receipt = if input.operation == "status" {
        json!({"token":token,"importedIds":[],"progress":[],"refreshCount":targets.len()})
    } else {
        receipt(&input.root, &targets, &import, None, &token)?
    };
    receipt["laneFetch"] = json!(true);
    if selection.lanes.len() > 1 {
        receipt["laneGroups"] = json!(groups);
    }
    let count = targets.len();
    state.inbound = Some(Retained { token, receipt: receipt.clone(), import, workspace: None });
    Ok((count, receipt))
}

fn select(input: &Prepare) -> io::Result<Selection> {
    let mut lanes = Vec::new();
    let mut seen = HashSet::new();
    let mut virtual_remotes: HashMap<String, VirtualRemote> = HashMap::new();
    for text in &input.ids {
        let id = parse_id(text, &mut seen)?;
        let fetched = remote::lane_objects(input, &id)?;
        let hash = if let Some((remote, hash)) = fetched {
            merge_remote(&mut virtual_remotes, remote)?;
            Some(hash)
        } else {
            None
        };
        lanes.push((id, hash));
    }
    validate_virtual_bounds(&virtual_remotes)?;
    Ok(Selection { lanes, virtual_remotes: virtual_remotes.into_values().collect() })
}

fn parse_id(text: &str, seen: &mut HashSet<String>) -> io::Result<lane::Id> {
    let (scope, name) = text.split_once('/').ok_or_else(|| invalid("inbound lane ID"))?;
    let id = lane::Id { scope: scope.to_owned(), name: name.to_owned() };
    id.validate()?;
    if id.is_main() || !seen.insert(text.to_owned()) {
        return Err(invalid("inbound lane requires distinct non-main IDs"));
    }
    Ok(id)
}

fn merge_remote(
    remotes: &mut HashMap<String, VirtualRemote>,
    remote: VirtualRemote,
) -> io::Result<()> {
    let Some(existing) = remotes.get_mut(&remote.scope) else {
        remotes.insert(remote.scope.clone(), remote);
        return Ok(());
    };
    let mut objects: HashMap<_, _> = existing.objects.drain(..).collect();
    for (key, bytes) in remote.objects {
        match objects.entry(key) {
            std::collections::hash_map::Entry::Vacant(entry) => {
                entry.insert(bytes);
            }
            std::collections::hash_map::Entry::Occupied(entry) if entry.get() == &bytes => {}
            std::collections::hash_map::Entry::Occupied(_) => {
                return Err(invalid("inbound duplicate object differs"));
            }
        }
    }
    existing.objects = objects.into_iter().collect();
    Ok(())
}

fn validate_virtual_bounds(remotes: &HashMap<String, VirtualRemote>) -> io::Result<()> {
    let mut virtual_bytes = 0usize;
    for remote in remotes.values() {
        for (_, bytes) in &remote.objects {
            virtual_bytes = virtual_bytes
                .checked_add(bytes.len())
                .ok_or_else(|| invalid("inbound remote object bounds"))?;
        }
    }
    if virtual_bytes > 96 * 1024 * 1024
        || remotes
            .values()
            .map(|remote| remote.objects.len())
            .sum::<usize>()
            > 16384
    {
        return Err(invalid("inbound remote object bounds"));
    }
    Ok(())
}

fn receive_lanes(
    input: &Prepare,
    lanes: &[(lane::Id, Option<String>)],
    import: &mut command_import::PreparedImport,
) -> io::Result<(Vec<Target>, Vec<usize>)> {
    let mut targets = Vec::new();
    let mut groups = Vec::new();
    for (id, hash) in lanes {
        let start = import.progress.len();
        let lane_targets = fetch_lane_targets(import, id, hash.as_deref())?;
        append_lane_dependency_progress(&input.root, import, &lane_targets)?;
        groups.push(import.progress.len() - start);
        targets.extend(lane_targets);
    }
    Ok((targets, groups))
}

fn fetch_lane_targets(
    import: &mut command_import::PreparedImport,
    id: &lane::Id,
    hash: Option<&str>,
) -> io::Result<Vec<Target>> {
    let record = import.fetch_lane_contents_at_hash(id, hash)?;
    import.retain_remote_lane_refs(&record)?;
    if let Some(progress) = import.progress.last_mut() {
        progress.reason = Some(format!("of their latest on lane {}/{}", id.scope, id.name));
    }
    lane::entries(&record.value)?
        .into_iter()
        .map(|entry| {
            let (scope, name) = entry.identity
                .split_once('/')
                .ok_or_else(|| invalid("inbound lane component identity"))?;
            Ok(Target { scope: Some(scope.to_owned()), name: name.to_owned(), version: entry.head })
        })
        .collect()
}

fn append_lane_dependency_progress(
    root: &Path,
    import: &mut command_import::PreparedImport,
    targets: &[Target],
) -> io::Result<()> {
    let mut dependencies = command_import::Progress {
        reason: Some("for getting missing versions and dependencies".into()),
        ..Default::default()
    };
    for target in targets {
        dependencies.ids.push(identity(target)?);
        let Some(version) = import.overlay.read(&target.version, "Version")? else { continue };
        if let Some(graph) = version["flattenedEdgesRef"].as_str() {
            crate::merge_history::hash(graph)?;
            if !root
                .join(".bit/objects")
                .join(&graph[..2])
                .join(&graph[2..])
                .try_exists()?
            {
                dependencies.objects.insert(graph.to_owned());
            }
        }
    }
    if !dependencies.objects.is_empty() {
        import.progress.push(dependencies);
    }
    Ok(())
}

#[cfg(test)]
mod tests;
