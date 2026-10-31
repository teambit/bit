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
        .ok_or_else(|| invalid("lane referenced scope"))?
        .to_owned();
    let merge = plan.merge.as_ref().ok_or_else(|| invalid("lane referenced merge"))?;
    let rebased = merge.rebased();
    let projection = Projection {
        plan,
        snapshots: merge.snapshot_versions(),
        rebased: &rebased,
        on_main: lane["current"].is_null(),
    };
    let mut heads = Vec::new();
    for result in
        plan.result["components"].as_array().ok_or_else(|| invalid("lane successful results"))?
    {
        let identity = result["id"]
            .as_str()
            .and_then(|id| id.trim().rsplit_once('@'))
            .map(|(identity, _)| identity.trim())
            .filter(|identity| !identity.is_empty())
            .ok_or_else(|| invalid("lane result identity"))?;
        if let Some(value) = projection.version(identity, &mut record.repository)? {
            heads.push((identity.to_owned(), value));
        }
    }
    record.repository.prepare_lane_referenced(&scope, &heads)
}
struct Projection<'a> {
    plan: &'a planning::Planned,
    snapshots: &'a [Value],
    rebased: &'a [(String, String, Value)],
    on_main: bool,
}
impl Projection<'_> {
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
            .filter(|hash| !hash.is_empty())
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
                    .and_then(|id| id.trim().rsplit_once('@'))
                    .is_some_and(|(id, _)| id.trim() == identity)
            })
            .map(|material| {
                self.rebased
                    .iter()
                    .find(|(id, _, _)| id.trim() == identity)
                    .map_or_else(|| material.version.clone(), |(_, _, version)| version.clone())
            })
    }
}
