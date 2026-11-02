//! Prepare referenced lane objects on [`Record`] via [`prepare`] after squash-rebase [`planning`].
//! Fetches missing referenced `Version` and `Source` objects before any workspace publication.

use super::{Record, invalid, planning, repository::Repository};
use serde_json::Value;
use std::io;

/// Capture the canonical post-squash fetch before any publication.
pub(super) fn prepare(record: &mut Record, plan: &planning::Planned) -> io::Result<()> {
    let lane = &record.context["lane"];
    if lane["shouldSquash"] != true || lane["other"].is_null() {
        return Ok(());
    }
    let scope = lane["otherId"]
        .as_str()
        .and_then(|raw| raw.split_once('/').map(|(scope, _)| scope))
        .or_else(|| lane["otherId"]["scope"].as_str())
        .map(str::trim)
        .filter(|scope| !scope.is_empty())
        .ok_or_else(|| invalid("lane referenced scope"))?;
    let merge = plan.merge.as_ref().ok_or_else(|| invalid("lane referenced merge"))?;
    let rebased = merge.rebased();
    let projection = Projection {
        plan,
        snapshots: merge.snapshot_versions(),
        rebased: &rebased,
        on_main: lane["current"].is_null(),
    };
    let results =
        plan.result["components"].as_array().ok_or_else(|| invalid("lane successful results"))?;
    let mut heads = Vec::with_capacity(results.len());
    for result in results {
        let identity = result["id"]
            .as_str()
            .map(|raw| {
                let raw = raw.trim();
                raw.rsplit_once('@').map_or(raw, |(base, _)| base.trim())
            })
            .filter(|identity| identity.contains('/'))
            .ok_or_else(|| invalid("lane result identity"))?;
        if let Some(value) = projection.version(identity, &mut record.repository)? {
            heads.push((identity.to_owned(), value));
        }
    }
    record.repository.prepare_lane_referenced(scope, &heads)
}
/// View over planned snapshots and rebased versions used to resolve post-squash head `Version` objects.
struct Projection<'a> {
    plan: &'a planning::Planned,
    snapshots: &'a [Value],
    rebased: &'a [(String, String, Value)],
    on_main: bool,
}
impl Projection<'_> {
    /// Resolves the post-squash head `Version` object for `identity` from planned snapshots, rebased versions, or `repository`.
    fn version(&self, identity: &str, repository: &mut Repository) -> io::Result<Option<Value>> {
        if self.on_main
            && let Some(value) = self.projected(identity)
        {
            return Ok(Some(value));
        }
        let model = repository.read_component(identity)?;
        let Some(hash) = model["head"]
            .as_str()
            .map(str::trim)
            .filter(|hash| !hash.is_empty() && *hash != "0")
        else {
            return Ok(None);
        };
        let value = self.rebased
            .iter()
            .find(|(id, reference, _)| id.trim() == identity && reference.trim() == hash)
            .map_or_else(
                || repository.read(hash, "Version"),
                |(_, _, version)| Ok(version.clone()),
            )?;
        Ok(Some(value))
    }
    /// Resolves the projected post-squash `Version` for `identity` from `self.snapshots` or `self.plan.materials` on `main`.
    fn projected(&self, identity: &str) -> Option<Value> {
        if let Some(version) = self.snapshots
            .iter()
            .find(|row| row["identity"].as_str().map(str::trim) == Some(identity))
        {
            return Some(version["version"].clone());
        }
        self.plan.materials
            .iter()
            .find(|material| {
                material.output["id"]
                    .as_str()
                    .map(|id| {
                        let id = id.trim();
                        id.rsplit_once('@').map_or(id, |(base, _)| base.trim())
                    })
                    == Some(identity)
            })
            .map(|material| {
                self.rebased
                    .iter()
                    .find(|(id, _, _)| id.trim() == identity)
                    .map_or_else(|| material.version.clone(), |(_, _, version)| version.clone())
            })
    }
}
