pub(super) mod comparison;
pub(super) mod workspace_diff;

mod history;
mod index;
mod remotes;
mod semantic;
mod versions;

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
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Target {
    identity: String,
    version: String,
}
#[derive(Serialize)]
pub(super) struct Snapshot {
    models: Vec<Value>,
    versions: Vec<(String, Value)>,
    semantics: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    histories: Option<Vec<Value>>,
}
pub(super) fn read(request: &Request, pool: &rayon::ThreadPool) -> io::Result<(usize, Value)> {
    let snapshot = load(request, pool, true)?;
    Ok((snapshot.models.len(), serde_json::to_value(snapshot).map_err(io::Error::other)?))
}
fn load(request: &Request, pool: &rayon::ThreadPool, stored_hashes: bool) -> io::Result<Snapshot> {
    super::path(&request.root)?;
    if request.targets.len() > 4096 {
        return Err(invalid("status model target limit"));
    }
    let items = index::read(&request.root)?;
    let directory = request.root.join(".bit/objects");
    let reader = Reader {
        directory: &directory,
        raw: Budget::new(32 * 1024 * 1024),
        packed: Budget::new(32 * 1024 * 1024),
    };
    let models = pool.install(|| {
        items
            .par_iter()
            .map(|item| index::model(&reader, item))
            .collect::<io::Result<Vec<_>>>()
    })?;
    let mut references = versions::references(&models, &request.targets)?;
    if request.include_heads {
        versions::include_heads(&models, &mut references)?;
    }
    let versions = versions::read(&reader, &references, pool)?;
    let semantics = if stored_hashes {
        pool.install(|| {
            versions
                .par_iter()
                .map(|(_, value)| semantic::hash(value))
                .collect::<io::Result<Vec<_>>>()
        })?
    } else {
        Vec::new()
    };
    let histories =
        if request.history { Some(history::read(&reader, &models, request, pool)?) } else { None };
    Ok(Snapshot { models, versions, semantics, histories })
}
struct Reader<'a> {
    directory: &'a Path,
    raw: Budget,
    packed: Budget,
}
impl Reader<'_> {
    fn read(&self, reference: &str, kind: &str) -> io::Result<Value> {
        let hash = crate::merge_history::hash(reference)?;
        let bytes = repository::read_shared(self.directory, hash, &self.raw, &self.packed)?;
        let (size, body) = repository::split(&bytes, hash, kind)?;
        size.parse::<usize>().map_err(|_| invalid("status model header size"))?;
        serde_json::from_slice(body).map_err(io::Error::other)
    }
}
