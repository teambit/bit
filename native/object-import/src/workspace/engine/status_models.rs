pub(super) mod comparison;
pub(super) mod harmony;
pub(super) mod list;
pub(super) mod versions;
pub(super) mod workspace_diff;

mod history;
mod history_population;
mod index;
mod lane;
mod remotes;
mod semantic;

use super::invalid;
use crate::{checkout::repository, read_budget::Budget};
use rayon::prelude::*;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    io,
    path::{Path, PathBuf},
};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Request {
    root: PathBuf,
    targets: Vec<Target>,
    #[serde(default)]
    history: bool,
    #[serde(default)]
    include_heads: bool,
    #[serde(default)]
    stage_history: bool,
    #[serde(default)]
    current_lane_id: Option<String>,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Target {
    identity: String,
    version: String,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct Snapshot {
    models: Vec<Value>,
    versions: Vec<(String, Value)>,
    semantics: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    histories: Option<Vec<Value>>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pending_history: Vec<Value>,
}
pub(super) fn read(request: &Request, pool: &rayon::ThreadPool) -> io::Result<(usize, Value)> {
    let snapshot = load(request, pool, true)?;
    Ok((snapshot.models.len(), serde_json::to_value(snapshot).map_err(io::Error::other)?))
}
fn load(request: &Request, pool: &rayon::ThreadPool, stored_hashes: bool) -> io::Result<Snapshot> {
    load_overlay(request, pool, stored_hashes, None)
}

pub(super) fn read_overlay(
    request: &Request,
    pool: &rayon::ThreadPool,
    overlay: &crate::command_import::Overlay,
) -> io::Result<(usize, Value)> {
    let snapshot = load_overlay(request, pool, true, Some(overlay))?;
    Ok((snapshot.models.len(), serde_json::to_value(snapshot).map_err(io::Error::other)?))
}

fn load_overlay(
    request: &Request,
    pool: &rayon::ThreadPool,
    stored_hashes: bool,
    overlay: Option<&crate::command_import::Overlay>,
) -> io::Result<Snapshot> {
    if overlay.is_some() && request.history {
        return Err(invalid("command history requires retained command owner"));
    }
    super::path(&request.root)?;
    if request.targets.len() > 4096 {
        return Err(invalid("status model target limit"));
    }
    let directory = request.root.join(".bit/objects");
    let reader = Reader {
        directory: &directory,
        overlay,
        raw: Budget::new(32 * 1024 * 1024),
        packed: Budget::new(32 * 1024 * 1024),
    };
    let lane = request.current_lane_id
        .as_deref()
        .map(|id| lane::read(&request.root, &reader, id))
        .transpose()?
        .flatten();
    let mut models = indexed_models(&reader, &request.root, pool)?;
    replace_models(&mut models, overlay);
    let references = selected_references(request, &models, lane.as_ref())?;
    let versions = versions::read(&reader, &references, pool)?;
    let semantics = stored_semantics(&versions, pool, stored_hashes)?;
    let (histories, pending_history) = if request.history {
        let (histories, pending) = history::read(&reader, &models, request, lane.as_ref(), pool)?;
        (Some(histories), pending)
    } else {
        (None, Vec::new())
    };
    Ok(Snapshot { models, versions, semantics, histories, pending_history })
}
fn indexed_models(
    reader: &Reader<'_>,
    root: &Path,
    pool: &rayon::ThreadPool,
) -> io::Result<Vec<Value>> {
    let items = index::read(root)?;
    pool.install(|| {
        items
            .par_iter()
            .map(|item| index::model(reader, item))
            .collect()
    })
}
fn selected_references(
    request: &Request,
    models: &[Value],
    lane: Option<&lane::Lane>,
) -> io::Result<Vec<String>> {
    let mut references = versions::references(models, &request.targets)?;
    if request.include_heads {
        versions::include_heads(models, &mut references)?;
        if let Some(lane) = lane {
            versions::include_lane_heads(&lane.heads, &mut references)?;
        }
    }
    Ok(references)
}
fn replace_models(models: &mut Vec<Value>, overlay: Option<&crate::command_import::Overlay>) {
    let Some(overlay) = overlay else {
        return;
    };
    for replacement in overlay.models() {
        if let Some(model) = models
            .iter_mut()
            .find(|model| {
                model["name"] == replacement["name"] && model["scope"] == replacement["scope"]
            })
        {
            *model = replacement.clone();
        } else {
            models.push(replacement.clone());
        }
    }
}
fn stored_semantics(
    versions: &[(String, Value)],
    pool: &rayon::ThreadPool,
    stored_hashes: bool,
) -> io::Result<Vec<String>> {
    if !stored_hashes {
        return Ok(Vec::new());
    }
    pool.install(|| {
        versions
            .par_iter()
            .map(|(_, value)| semantic::hash(value))
            .collect()
    })
}
struct Reader<'a> {
    directory: &'a Path,
    overlay: Option<&'a crate::command_import::Overlay>,
    raw: Budget,
    packed: Budget,
}
impl Reader<'_> {
    fn read(&self, reference: &str, kind: &str) -> io::Result<Value> {
        if let Some(overlay) = self.overlay
            && let Some(value) = overlay.read(reference, kind)?
        {
            return Ok(value.clone());
        }
        let hash = crate::merge_history::hash(reference)?;
        let bytes = repository::read_shared(self.directory, hash, &self.raw, &self.packed)?;
        let (size, body) = repository::split(&bytes, hash, kind)?;
        size.parse::<usize>().map_err(|_| invalid("status model header size"))?;
        serde_json::from_slice(body).map_err(io::Error::other)
    }
}
