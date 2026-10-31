//! Validate actual class-directory metadata against the native eligible inventory.
#[cfg(test)]
mod tests;

use super::{Loaded, Session};
use crate::model::WorkspaceComponent;
use std::{collections::HashMap, io, path::Path};

pub(crate) async fn load(
    session: &Session<'_>,
    loaded: &Loaded,
    phase: &str,
) -> io::Result<Vec<WorkspaceComponent>> {
    load_with_status(session, loaded, phase, true).await
}

pub(crate) async fn initial(
    session: &Session<'_>,
    loaded: &Loaded,
    classes_loaded: bool,
) -> io::Result<Vec<WorkspaceComponent>> {
    load_with_status(session, loaded, "initial", !classes_loaded).await
}

async fn load_with_status(
    session: &Session<'_>,
    loaded: &Loaded,
    phase: &str,
    announce: bool,
) -> io::Result<Vec<WorkspaceComponent>> {
    let components = loaded.components();
    let ids = components
        .iter()
        .map(identity)
        .collect::<Vec<_>>();
    let Some(receipt) = session.host.installation_components(phase, &ids).await? else {
        if announce {
            session.loading(loaded);
        }
        return Ok(components);
    };
    ordered(&session.root, components, &receipt)
}

pub(crate) fn identity(component: &WorkspaceComponent) -> String {
    let id = component.id.to_string_without_version();
    match component.id.version
        .as_deref()
        .map(str::trim)
        .filter(|version| !version.is_empty())
    {
        Some(version) => format!("{id}@{version}"),
        None => id,
    }
}

fn ordered(
    root: &Path,
    components: Vec<WorkspaceComponent>,
    receipt: &serde_json::Value,
) -> io::Result<Vec<WorkspaceComponent>> {
    let invalid = || io::Error::other("installation class directory inventory changed");
    let rows = receipt["components"].as_array().ok_or_else(invalid)?;
    if rows.len() != components.len() {
        return Err(invalid());
    }
    let mut remaining = components
        .into_iter()
        .map(|row| (identity(&row), row))
        .collect::<HashMap<_, _>>();
    rows.iter()
        .map(|row| ordered_row(root, row, &mut remaining))
        .collect()
}

fn ordered_row(
    root: &Path,
    row: &serde_json::Value,
    remaining: &mut HashMap<String, WorkspaceComponent>,
) -> io::Result<WorkspaceComponent> {
    let invalid = || io::Error::other("installation class directory inventory changed");
    let id = row["id"]
        .as_str()
        .or_else(|| row["identity"].as_str())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(invalid)?;
    let component = remove_matching(remaining, id).ok_or_else(invalid)?;
    let directory = row["directory"]
        .as_str()
        .or_else(|| row["rootDir"].as_str())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(invalid)?;
    let actual = if Path::new(directory).is_absolute() {
        Path::new(directory).to_path_buf()
    } else {
        root.join(directory)
    };
    if actual != root.join(&component.root_dir) {
        return Err(invalid());
    }
    Ok(component)
}

fn remove_matching(
    remaining: &mut HashMap<String, WorkspaceComponent>,
    id: &str,
) -> Option<WorkspaceComponent> {
    if let Some(component) = remaining.remove(id) {
        return Some(component);
    }
    if id.contains('@') {
        let bare = id.split('@').next().unwrap_or(id);
        return remaining.remove(bare);
    }
    let key = remaining
        .keys()
        .find(|candidate| candidate.split('@').next() == Some(id))?
        .clone();
    remaining.remove(&key)
}
