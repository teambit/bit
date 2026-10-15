//! Pre-install import of missing scope objects: `importer.importCurrentObjects()`
//! (`objectsOnly`, so no workspace file is written). On main it imports the
//! objects of every exported `.bitmap` id (`importAccordingToBitMap`); on a
//! remote lane it first fetches the lane object (`importObjectsOnLane`).

pub(crate) mod remotes {
    pub use bit_client_transfer::remotes::*;
}

pub use bitmap::{Bitmap, Id, LaneId};
pub use fetch::FetchOptions;
pub use lane::local_update_dependents;
pub use objects::Repo;
pub use tar::ObjectItem;

mod bitmap;
mod component;
mod fetch;
mod fs_remote;
mod history;
mod http {
    pub use bit_client_transfer::http::*;
}
mod lane;
mod objects;
mod persist;
mod plan;
mod resolver {
    pub use bit_client_transfer::resolver::*;
}
mod tar {
    pub use bit_client_transfer::tar::*;
}

use crate::{host::HostInfo, model::GlobalConfig, output::Output};
use fetch::Fetcher;
use http::Network;
use lane::RemoteLane;
use plan::Importer;
use remotes::Remotes;
use resolver::Resolver;
use serde_json::Value;
use std::{fs, io, path::Path, time::Instant};

/// `BEFORE_IMPORT_ACTION` in `import-components.ts`.
const IMPORTING: &str = "importing components";

/// What the import added to the workspace scope.
#[derive(Debug, Default, Clone, Copy, PartialEq, Eq)]
pub struct ImportSummary {
    /// Component objects received (merged or added).
    pub components: usize,
    /// Other objects written.
    pub objects: usize,
}

/// Import the objects `.bitmap` needs into the scope at `scope_dir` (`.bit`
/// or `.git/bit`) of the workspace at `root`.
pub async fn import_current_objects(
    root: &Path,
    scope_dir: &Path,
    global: &GlobalConfig,
    info: &HostInfo,
    output: &Output,
) -> io::Result<ImportSummary> {
    output.status("importing missing objects");
    output.status(IMPORTING);
    let started = Instant::now();
    let summary = import(root, scope_dir, global, info, output).await?;
    output.success(IMPORTING, Some(started));
    Ok(summary)
}

async fn import(
    root: &Path,
    scope_dir: &Path,
    global: &GlobalConfig,
    info: &HostInfo,
    output: &Output,
) -> io::Result<ImportSummary> {
    let bitmap = bitmap::read(root)?;
    let scope_json = read_scope_json(scope_dir)?;
    let local_scope = scope_json["name"]
        .as_str()
        .unwrap_or_default()
        .to_string();
    let (remotes, network) = connect(&scope_json, &local_scope, global, info)?;
    let fetcher =
        Fetcher { remotes: &remotes, network: &network, concurrency: fetch::concurrency(global) };
    let repo = Repo::new(scope_dir);
    let remote_lane = match &bitmap.lane {
        Some(lane) => lane::fetch_remote_lane(&fetcher, lane).await?,
        None => None,
    };
    if let Some(lane) = &remote_lane {
        lane::sync_remote_refs(&repo, lane)?;
    }
    let ids = ids_to_import(&bitmap, remote_lane.as_ref());
    let importer = Importer {
        repo: &repo,
        fetcher: &fetcher,
        local_scope: &local_scope,
        lane: remote_lane.as_ref(),
        output: Some(output),
        refetch_incomplete_history: history::refetch_requested(),
    };
    let written = importer.import(&ids).await?;
    if let Some(lane) = &remote_lane {
        lane::merge_and_save(&repo, lane, &lane::Identity::from_config(global))?;
    }
    Ok(ImportSummary { components: written.components.len(), objects: written.objects })
}

/// The remotes the workspace scope knows (with its custom resolver) and the
/// HTTP client that reaches them.
fn connect(
    scope_json: &Value,
    local_scope: &str,
    global: &GlobalConfig,
    info: &HostInfo,
) -> io::Result<(Remotes, Network)> {
    let resolver = Resolver::configured(
        scope_json,
        info.node_path.clone(),
        info.bit_dir.clone(),
        local_scope,
        global,
    );
    let remotes =
        Remotes::load(scope_json, &info.global_config_dir, global)?.with_resolver(resolver);
    let network =
        Network::new(global, &info.bit_version, Some(local_scope), info.token.as_deref())?;
    Ok((remotes, network))
}

/// `getIdsToImportFromBitmap()` on main; on a lane, the lane ids (with hidden
/// update-dependents) and the current-lane `.bitmap` ids the lane lacks.
fn ids_to_import(bitmap: &Bitmap, lane: Option<&RemoteLane>) -> Vec<Id> {
    let Some(lane) = lane else { return bitmap.ids.clone() };
    let mut ids = lane.ids_with_update_dependents();
    for id in &bitmap.current_lane_ids {
        if !ids.contains(id) {
            ids.push(id.clone());
        }
    }
    ids
}

fn read_scope_json(scope_dir: &Path) -> io::Result<Value> {
    match fs::read(scope_dir.join("scope.json")) {
        Ok(bytes) => {
            serde_json::from_slice(&bytes).map_err(|_| objects::invalid("invalid scope.json"))
        }
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(Value::Null),
        Err(error) => Err(error),
    }
}

#[cfg(test)]
mod tests;
