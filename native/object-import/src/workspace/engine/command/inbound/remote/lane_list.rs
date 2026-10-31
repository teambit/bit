//! The visible heads of the active remote Lane, before main-only wildcard matches.
use super::{Listed, ObjectItem, VirtualRemote, invalid};
use crate::command_import::lane;
use std::io;

pub(super) fn visible(entries: Vec<lane::Entry>) -> io::Result<Vec<Listed>> {
    entries
        .into_iter()
        .filter(|entry| !entry.hidden)
        .map(|entry| {
            let (scope, name) = entry.identity
                .trim()
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

pub(super) fn lane_targets(
    id: &lane::Id,
    items: &[ObjectItem],
) -> io::Result<(String, Vec<String>)> {
    let (hash, entries) = remote_lane(id, items)?;
    let targets = entries
        .into_iter()
        .map(|entry| format!("{}@{}", entry.identity.trim(), entry.head.trim()))
        .collect();
    Ok((hash, targets))
}

pub(super) fn remote_lane(
    id: &lane::Id,
    items: &[ObjectItem],
) -> io::Result<(String, Vec<lane::Entry>)> {
    let mut selected = None;
    for item in items {
        let raw = crate::checkout::repository::inflate(&item.compressed, 32 * 1024 * 1024)?;
        if !raw.starts_with(b"Lane ") {
            continue;
        }
        let (_, body) = crate::checkout::repository::split(
            &raw,
            crate::merge_history::hash(&item.hash)?,
            "Lane",
        )?;
        let value = crate::parse_jsonc(body)?;
        if value["scope"].as_str().map(str::trim) != Some(id.scope.trim())
            || value["name"].as_str().map(str::trim) != Some(id.name.trim())
            || selected.is_some()
        {
            return Err(invalid("inbound HTTP Lane identity"));
        }
        lane::validate_value(id, &value)?;
        let entries = lane::entries(&value)?;
        if entries.len() > 4096 {
            return Err(invalid("inbound HTTP Lane component limit"));
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
        .map(|(_, bytes)| bytes.clone())
        .ok_or_else(|| invalid("inbound HTTP Lane capture"))?;
    let item = ObjectItem { hash: hash.trim().to_owned(), compressed, scope: None };
    remote_lane(id, &[item]).map(|(_, entries)| entries)
}
