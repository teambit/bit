//! Preserve the parent operation's live `.bitmap` order across native install reloads.
//!
//! [`apply`] reorders loaded [`Workspace`] entries and components to match the host's in-memory component list.
use crate::workspace::Workspace;
use std::{collections::HashMap, io};

pub(super) fn apply(workspace: &mut Workspace, order: &[String]) -> io::Result<()> {
    if order.is_empty() {
        return Ok(());
    }
    if workspace.entries.len() != workspace.components.len()
        || order.len() != workspace.components.len()
    {
        return Err(io::Error::other("installation component order count"));
    }
    let mut rows = HashMap::with_capacity(order.len());
    for (entry, component) in workspace.entries
        .drain(..)
        .zip(workspace.components.drain(..))
    {
        rows.insert(component.id.to_string_without_version(), (entry, component));
    }
    if rows.len() != order.len() {
        return Err(io::Error::other("installation component order duplicate identity"));
    }
    for identity in order {
        let key = normalize_order_identity(identity);
        if key.is_empty() {
            return Err(io::Error::other("installation component order identity"));
        }
        let (entry, component) = rows
            .remove(key)
            .or_else(|| rows.remove(identity.trim()))
            .ok_or_else(|| io::Error::other("installation component order identity"))?;
        workspace.entries.push(entry);
        workspace.components.push(component);
    }
    if !rows.is_empty() {
        return Err(io::Error::other("installation component order incomplete"));
    }
    Ok(())
}

#[inline]
fn normalize_order_identity(identity: &str) -> &str {
    let trimmed = identity.trim().trim_matches('/');
    match trimmed.rfind('@') {
        Some(index) if index > 0 && !trimmed[index + 1..].contains('/') => {
            trimmed[..index].trim().trim_matches('/')
        }
        _ => trimmed,
    }
}
