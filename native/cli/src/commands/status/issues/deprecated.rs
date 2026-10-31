//! `DeprecationMain.isDeprecatedByIdWithoutLoadingComponent` over verified model heads.

use super::{Checks, Component, array, truthy, without_version};
use node_semver::{Range, Version};
use serde_json::Value;
use std::io;

const DEPRECATION: &str = "teambit.component/deprecation";

impl Checks<'_> {
    pub(super) fn deprecated_dependencies(&self, component: &Component) -> io::Result<Vec<String>> {
        if deprecated(self.context, &component.identity)? {
            return Ok(Vec::new());
        }
        component.dependencies
            .iter()
            .filter_map(|id| match deprecated(self.context, id) {
                Ok(true) => Some(Ok(id.clone())),
                Ok(false) => None,
                Err(error) => Some(Err(error)),
            })
            .collect()
    }
}

fn deprecated(context: &Value, full_id: &str) -> io::Result<bool> {
    let identity = without_version(full_id);
    let target = array(context.get("targets"), "deprecation targets")?
        .iter()
        .find(|target| target["identity"] == identity);
    if let Some(value) = target
        .and_then(|target| {
            crate::commands::update_cmd::aspect_entry(&target["componentConfig"], DEPRECATION)
        })
        .and_then(|(_, cfg)| cfg["deprecate"].as_bool())
    {
        return Ok(value);
    }
    let models = array(context.get("models"), "deprecation models")?;
    let model = models
        .iter()
        .find(|model| {
            format!(
                "{}/{}",
                model["scope"].as_str().unwrap_or_default(),
                model["name"].as_str().unwrap_or_default(),
            ) == identity
        });
    let Some(model) = model else {
        return Ok(false);
    };
    if truthy(model.get("deprecated")) {
        return Ok(true);
    }
    let Some(extension) = head_deprecation(context, model, identity)? else {
        return Ok(false);
    };
    if truthy(extension["config"].get("deprecate")) {
        return Ok(true);
    }
    range_matches(model, full_id, &extension["config"])
}

fn head_deprecation<'c>(
    context: &'c Value,
    model: &'c Value,
    identity: &str,
) -> io::Result<Option<&'c Value>> {
    let head = context["laneHeads"]
        .get(identity)
        .unwrap_or_else(|| &model["head"]);
    let version = array(context.get("versions"), "deprecation versions")?
        .iter()
        .find(|row| &row[0] == head);
    let Some(version) = version else {
        return Ok(None);
    };
    let extension = version[1]["extensions"]
        .as_array()
        .into_iter()
        .flatten()
        .find(|extension| crate::commands::update_cmd::matches_aspect(extension, DEPRECATION));
    let Some(extension) = extension else {
        return Ok(None);
    };
    Ok(Some(extension))
}

fn range_matches(model: &Value, full_id: &str, config: &Value) -> io::Result<bool> {
    let Some(range) = config["range"].as_str() else {
        return Ok(false);
    };
    let Some((_, version)) = full_id.rsplit_once('@') else {
        return Ok(false);
    };
    let tags =
        model["versions"].as_object().ok_or_else(|| super::decline("deprecation model tags"))?;
    let tag = if tags.contains_key(version) {
        Some(version)
    } else {
        tags.iter()
            .find(|(_, reference)| reference.as_str() == Some(version))
            .map(|(tag, _)| tag.as_str())
    };
    let Some(tag) = tag else {
        return Ok(false);
    };
    Ok(Range::parse(range)
        .is_ok_and(|range| Version::parse(tag).is_ok_and(|version| version.satisfies(&range))))
}
