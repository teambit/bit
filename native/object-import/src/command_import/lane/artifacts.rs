//! Artifact `Source` object collection and import staging for lane components on [`PreparedImport`].

use super::{PreparedImport, invalid};
use serde_json::Value;
use std::io;

impl PreparedImport {
    /// Stage artifact `Source` objects for `versions` on the fetched lane via [`artifact_refs`] before publication.
    pub(crate) fn prepare_lane_artifacts(&mut self, versions: &[String]) -> io::Result<()> {
        let Some(lane) = &self.cache.fetched_lane else {
            return Ok(());
        };
        if versions.len() > 4096 {
            return Err(invalid("lane artifact component budget"));
        }
        let scope = lane_field(&lane.value, "scope", "lane artifact scope")?;
        let name = lane_field(&lane.value, "name", "lane artifact name")?;
        let mut references = Vec::new();
        for version in versions {
            let value = self.lane_version(version)?;
            references.extend(artifact_refs(&value)?);
            if references.len() > 4096 {
                return Err(invalid("lane artifact Source budget"));
            }
        }
        self.prepare_lane_objects(
            &scope,
            &references,
            "Source",
            Some(&format!(
                "to get all artifacts for {} components from lane {scope}/{name}",
                versions.len(),
            )),
        )
    }
}
/// Extract a required trimmed non-empty string field `key` from a `Lane` JSON [`Value`].
#[inline]
fn lane_field(lane: &Value, key: &str, msg: &'static str) -> io::Result<String> {
    lane[key]
        .as_str()
        .map(str::trim)
        .filter(|val| !val.is_empty())
        .map(str::to_owned)
        .ok_or_else(|| invalid(msg))
}
/// Extract artifact `Source` SHA-1 references from `version`'s `teambit.pipelines/builder` aspect via [`collect_builder_references`].
#[inline]
fn artifact_refs(version: &Value) -> io::Result<Vec<String>> {
    let Some(extensions) = version
        .get("extensions")
        .filter(|value| !value.is_null())
    else {
        return Ok(Vec::new());
    };
    let rows = extensions.as_array().ok_or_else(|| invalid("lane artifact extensions"))?;
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

/// Collect and validate SHA-1 `Source` references across all builder `artifacts` ([`Value`]) entries.
#[inline]
fn collect_builder_references(artifacts: &Value) -> io::Result<Vec<String>> {
    let mut references = Vec::new();
    for artifact in artifacts.as_array().ok_or_else(|| invalid("lane builder artifacts"))? {
        let Some(files) = artifact
            .get("files")
            .filter(|value| !value.is_null())
        else {
            continue;
        };
        for file in files.as_array().ok_or_else(|| invalid("lane artifact files"))? {
            let reference = file["file"]
                .as_str()
                .map(str::trim)
                .ok_or_else(|| invalid("lane artifact Source"))?;
            crate::merge_history::hash(reference)?;
            references.push(reference.to_owned());
        }
    }
    Ok(references)
}
