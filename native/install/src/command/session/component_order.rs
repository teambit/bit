//! Preserve the parent operation's live bitmap order across native install reloads.
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
    let mut rows = std::mem::take(&mut workspace.entries)
        .into_iter()
        .zip(std::mem::take(&mut workspace.components))
        .map(|(entry, component)| (component.id.to_string_without_version(), (entry, component)))
        .collect::<HashMap<_, _>>();
    let ordered = order
        .iter()
        .map(|identity| {
            rows.remove(identity)
                .ok_or_else(|| io::Error::other("installation component order identity"))
        })
        .collect::<io::Result<Vec<_>>>()?;
    if !rows.is_empty() {
        return Err(io::Error::other("installation component order incomplete"));
    }
    (workspace.entries, workspace.components) = ordered.into_iter().unzip();
    Ok(())
}
