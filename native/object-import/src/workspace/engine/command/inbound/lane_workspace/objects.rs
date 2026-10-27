//! No-ID imports retain both lane heads and distinct tracked versions without workspace writes.
use super::{Prepare, Target, invalid, lane, lanes, remote};
use crate::command_import::{self, PreparedImport, VirtualRemote};
use std::{collections::HashMap, io};

pub(super) fn prepare(
    input: &Prepare,
    roots: &[Target],
    id: &lane::Id,
) -> io::Result<(Vec<Target>, PreparedImport)> {
    if !input.ids.is_empty()
        || input.options.dependencies.import_dependencies
        || input.options.dependencies.import_head_dependencies
    {
        return Err(invalid("inbound lane object import mode"));
    }
    let (remotes, hash) = capture_remotes(input, roots, id)?;
    let mut import = command_import::prepare_lane_with_virtual(
        &input.root,
        &input.global_remotes_file,
        &remotes,
    )?;
    let selected = import.prepare_fetch_lane(
        &input.root,
        id,
        hash.as_deref(),
        roots,
        input.options.all_history,
        input.options.dependencies.fetch_deps,
    )?;
    Ok((selected, import))
}

fn capture_remotes(
    input: &Prepare,
    roots: &[Target],
    id: &lane::Id,
) -> io::Result<(Vec<VirtualRemote>, Option<String>)> {
    let incoming = remote::lane_objects(input, id)?;
    let mut remotes = HashMap::new();
    let hash = if let Some((incoming, hash)) = incoming {
        let entries = remote::lane_entries(&incoming, &hash, id)?;
        let main = roots
            .iter()
            .filter(|target| {
                let identity =
                    format!("{}/{}", target.scope.as_deref().unwrap_or_default(), target.name);
                !entries
                    .iter()
                    .any(|entry| entry.identity == identity)
            })
            .cloned()
            .collect::<Vec<_>>();
        lanes::merge_remote(&mut remotes, incoming)?;
        for remote in remote::objects(input, &main)? {
            lanes::merge_remote(&mut remotes, remote)?;
        }
        Some(hash)
    } else {
        None
    };
    lanes::validate_virtual_bounds(&remotes)?;
    Ok((remotes.into_values().collect(), hash))
}
