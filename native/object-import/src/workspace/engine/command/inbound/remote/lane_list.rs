//! Visible heads ([`visible`], [`Listed`]) of the active remote `Lane`, before main-only wildcard matches.

use super::{Listed, ObjectItem, VirtualRemote, invalid};
use crate::command_import::lane;
use std::io;

/// Projects non-hidden [`lane::Entry`] rows into [`Listed`] items for remote lane listing.
#[inline]
pub(super) fn visible(entries: Vec<lane::Entry>) -> io::Result<Vec<Listed>> {
    entries
        .into_iter()
        .filter(|entry| !entry.hidden)
        .map(|entry| {
            let raw = entry.identity.trim();
            let bare = raw.rsplit_once('@').map_or(raw, |(base, _)| base.trim());
            let (scope, name) = bare
                .split_once('/')
                .map(|(scope, name)| (scope.trim(), name.trim()))
                .filter(|(scope, name)| !scope.is_empty() && !name.is_empty())
                .ok_or_else(|| invalid("inbound lane component identity"))?;
            Ok(Listed {
                scope: scope.to_owned(),
                name: name.to_owned(),
                version: Some(entry.head.trim().to_owned()).filter(|ver| !ver.is_empty()),
                // Node filters deprecation only for the main-scope list.
                deprecated: false,
            })
        })
        .collect()
}

/// Extracts the remote `Lane` hash and `<scope>/<name>@<head>` target strings from `items`.
pub(super) fn lane_targets(
    id: &lane::Id,
    items: &[ObjectItem],
) -> io::Result<(String, Vec<String>)> {
    let (hash, entries) = remote_lane(id, items)?;
    let targets = entries
        .into_iter()
        .map(|entry| {
            let raw = entry.identity.trim();
            let bare = raw.rsplit_once('@').map_or(raw, |(base, _)| base.trim());
            let head = entry.head.trim();
            if bare.is_empty() || head.is_empty() {
                return Err(invalid("inbound lane component identity"));
            }
            Ok(format!("{bare}@{head}"))
        })
        .collect::<io::Result<Vec<_>>>()?;
    Ok((hash, targets))
}

pub(super) fn remote_lane(
    id: &lane::Id,
    items: &[ObjectItem],
) -> io::Result<(String, Vec<lane::Entry>)> {
    let mut selected = None;
    for item in items {
        let Some(entries) = parse_lane_object(id, &item.hash, &item.compressed)? else {
            continue;
        };
        if selected.is_some() {
            return Err(invalid("inbound HTTP Lane identity"));
        }
        selected = Some((item.hash.trim().to_owned(), entries));
    }
    selected.ok_or_else(|| invalid("inbound HTTP Lane missing"))
}

pub(in crate::workspace::engine::command) fn lane_entries(
    remote: &VirtualRemote,
    hash: &str,
    id: &lane::Id,
) -> io::Result<Vec<lane::Entry>> {
    let compressed = remote.objects
        .iter()
        .find(|(item_hash, _)| item_hash.trim().eq_ignore_ascii_case(hash.trim()))
        .map(|(_, bytes)| bytes.as_slice())
        .ok_or_else(|| invalid("inbound HTTP Lane capture"))?;
    parse_lane_object(id, hash, compressed)?.ok_or_else(|| invalid("inbound HTTP Lane missing"))
}

fn parse_lane_object(
    id: &lane::Id,
    hash: &str,
    compressed: &[u8],
) -> io::Result<Option<Vec<lane::Entry>>> {
    let raw = crate::checkout::repository::inflate(compressed, 32 * 1024 * 1024)?;
    if !raw.starts_with(b"Lane ") {
        return Ok(None);
    }
    let (_, body) =
        crate::checkout::repository::split(&raw, crate::merge_history::hash(hash)?, "Lane")?;
    let value = crate::parse_jsonc(body)?;
    if value["scope"].as_str().map(str::trim) != Some(id.scope.trim())
        || value["name"].as_str().map(str::trim) != Some(id.name.trim())
    {
        return Err(invalid("inbound HTTP Lane identity"));
    }
    lane::validate_value(id, &value)?;
    let entries = lane::entries(&value)?;
    if entries.len() > 4096 {
        return Err(invalid("inbound HTTP Lane component limit"));
    }
    Ok(Some(entries))
}
