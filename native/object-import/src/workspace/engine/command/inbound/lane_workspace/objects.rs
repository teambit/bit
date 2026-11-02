//! No-ID imports ([`prepare`], [`Target`], [`PreparedImport`]) retain both lane heads and distinct tracked versions without workspace writes.

use super::{Prepare, Target, invalid, lane, lanes, remote};
use crate::command_import::{self, PreparedImport, VirtualRemote};
use std::{
    collections::{HashMap, HashSet},
    io,
};

pub(super) fn prepare(
    input: &Prepare,
    roots: &[Target],
    id: &lane::Id,
) -> io::Result<(Vec<Target>, PreparedImport)> {
    id.validate()?;
    if id.is_main()
        || roots.len() > 4096
        || !input.ids.is_empty()
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
        let main = unmatched_roots(roots, &entries);
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

#[inline]
fn unmatched_roots(roots: &[Target], entries: &[lane::Entry]) -> Vec<Target> {
    let entry_set: HashSet<_> = entries.iter().map(entry_key).collect();
    roots
        .iter()
        .filter(|target| !entry_set.contains(&target_key(target)))
        .cloned()
        .collect()
}

#[inline]
fn entry_key(entry: &lane::Entry) -> (Option<&str>, &str) {
    let raw = entry.identity.trim();
    let bare = raw.rsplit_once('@').map_or(raw, |(base, _)| base.trim());
    match bare.split_once('/') {
        Some((scope, name)) => (Some(scope.trim()), name.trim()),
        None => (None, bare),
    }
}

#[inline]
fn target_key(target: &Target) -> (Option<&str>, &str) {
    (
        target.scope
            .as_deref()
            .map(str::trim)
            .filter(|scope| !scope.is_empty()),
        target.name.trim(),
    )
}
