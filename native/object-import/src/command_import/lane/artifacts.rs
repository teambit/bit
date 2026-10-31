use super::{PreparedImport, invalid};
use serde_json::Value;
use std::io;

impl PreparedImport {
    /// Called after status/pattern/squash preparation, before any publication.
    /// Canonical artifact import covers every status ID, including exclusions.
    pub(crate) fn prepare_lane_artifacts(&mut self, versions: &[String]) -> io::Result<()> {
        let Some(lane) = self.cache.fetched_lane.clone() else { return Ok(()) };
        if versions.len() > 4096 {
            return Err(invalid("lane artifact component budget"));
        }
        let mut references = Vec::new();
        for version in versions {
            let value = self.lane_version(version)?;
            references.extend(artifact_refs(&value)?);
            if references.len() > 4096 {
                return Err(invalid("lane artifact Source budget"));
            }
        }
        let scope = lane.value["scope"].as_str().ok_or_else(|| invalid("lane artifact scope"))?;
        let name = lane.value["name"].as_str().ok_or_else(|| invalid("lane artifact name"))?;
        self.prepare_lane_objects(
            scope,
            &references,
            "Source",
            Some(&format!(
                "to get all artifacts for {} components from lane {scope}/{name}",
                versions.len(),
            )),
        )
    }
}
fn artifact_refs(version: &Value) -> io::Result<Vec<String>> {
    let rows =
        version["extensions"].as_array().ok_or_else(|| invalid("lane artifact extensions"))?;
    let Some(builder) = rows
        .iter()
        .find(|row| {
            crate::workspace::engine::client_status::config::is_extension_aspect(
                row,
                "teambit.pipelines/builder",
            )
        })
    else {
        return Ok(Vec::new());
    };
    let Some(artifacts) = builder["data"]
        .get("artifacts")
        .filter(|value| !value.is_null() && **value != Value::Bool(false))
    else {
        return Ok(Vec::new());
    };
    collect_builder_references(artifacts)
}

fn collect_builder_references(artifacts: &Value) -> io::Result<Vec<String>> {
    let mut references = Vec::new();
    for artifact in artifacts.as_array().ok_or_else(|| invalid("lane builder artifacts"))? {
        for file in artifact["files"].as_array().ok_or_else(|| invalid("lane artifact files"))? {
            let reference = file["file"].as_str().ok_or_else(|| invalid("lane artifact Source"))?;
            crate::merge_history::hash(reference)?;
            references.push(reference.to_owned());
        }
    }
    Ok(references)
}
