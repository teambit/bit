//! `findMissingExternalsRecursively` with `preferDependencyGraph`, over what a fetch
//! without dependencies returned: the requested components to fetch again with their
//! dependencies, as `importMany` does after `importWithoutDeps`.

use crate::{checkout::repository, merge_history, validate::hexadecimal};
use bit_client_transfer::tar::ObjectItem;
use serde_json::Value;
use sha1::Digest;
use std::{collections::HashMap, path::Path};

/// The objects one request returned, then the workspace's own.
struct Objects<'a> {
    fetched: HashMap<&'a str, &'a [u8]>,
    local: &'a Path,
}

/// The requested `ids` whose Version has no dependency graph and whose flattened
/// dependencies are not all present and built. An object that cannot be read counts as
/// missing, so the second request can only fetch more than needed.
pub(super) fn requests(items: &[ObjectItem], ids: &[String], root: &Path) -> Vec<String> {
    let objects = Objects {
        fetched: items
            .iter()
            .map(|item| (item.hash.as_str(), item.compressed.as_slice()))
            .collect(),
        local: &crate::scope_path(root).join("objects"),
    };
    ids.iter()
        .filter(|id| objects.misses_dependencies(id))
        .cloned()
        .collect()
}

impl Objects<'_> {
    fn misses_dependencies(&self, id: &str) -> bool {
        let Some(version) = self.version(id) else { return true };
        if self.has_edges(&version) {
            return false;
        }
        let Some(dependencies) = self.flattened_dependencies(&version) else { return true };
        let dev_dependencies = version["flattenedDevDependencies"].as_array();
        dependencies
            .iter()
            .chain(dev_dependencies.into_iter().flatten())
            .any(|dependency| !self.built(dependency))
    }

    fn flattened_dependencies(&self, version: &Value) -> Option<Vec<Value>> {
        if let Some(rows) = version["flattenedDependencies"].as_array()
            && (!rows.is_empty() || !version["flattenedDependenciesRef"].is_string())
        {
            return Some(rows.clone());
        }
        if let Some(hash) = version["flattenedDependenciesRef"].as_str() {
            let body = self.body(hash, "Source")?;
            let parsed = crate::parse_jsonc(&body).ok()?;
            return parsed.as_array().cloned();
        }
        version["flattenedDependencies"].as_array().cloned()
    }

    /// `sources.getMany(flattenedDependencies, reFetchUnBuiltVersion)`: the dependency's
    /// Version exists and is built.
    fn built(&self, dependency: &Value) -> bool {
        dependency_id(dependency)
            .and_then(|id| self.version(&id))
            .is_some_and(|version| {
                matches!(version["buildStatus"].as_str(), Some("succeed" | "skipped"))
            })
    }

    /// The Version `scope/name[@version]` names: the head for `latest` or no version.
    fn version(&self, id: &str) -> Option<Value> {
        let (identity, version) = id
            .rsplit_once('@')
            .map_or((id, None), |(identity, version)| (identity, Some(version)));
        let model_hash = hexadecimal(&sha1::Sha1::digest(identity.as_bytes()));
        let model = self.object(&model_hash, "Component")?;
        let hash = match version {
            None | Some("" | "latest" | "head") => model["head"].as_str()?.to_owned(),
            Some(version) if merge_history::hash(version).is_ok() => version.to_owned(),
            Some(version) => model["versions"][version]
                .as_str()
                .or_else(|| model["orphanedVersions"][version].as_str())?
                .to_owned(),
        };
        self.object(&hash, "Version")
    }

    /// `getFlattenedEdges` is not empty.
    fn has_edges(&self, version: &Value) -> bool {
        if version["flattenedEdges"]
            .as_array()
            .is_some_and(|edges| !edges.is_empty())
        {
            return true;
        }
        version["flattenedEdgesRef"]
            .as_str()
            .and_then(|hash| self.body(hash, "Source"))
            .and_then(|body| crate::parse_jsonc(&body).ok())
            .and_then(|edges| {
                edges
                    .as_array()
                    .map(|edges| !edges.is_empty())
            })
            .unwrap_or(false)
    }

    fn object(&self, hash: &str, kind: &str) -> Option<Value> {
        crate::parse_jsonc(&self.body(hash, kind)?).ok()
    }

    /// The body of the `kind` object `hash`, fetched or local.
    fn body(&self, hash: &str, kind: &str) -> Option<Vec<u8>> {
        let identity = merge_history::hash(hash).ok()?;
        let raw = match self.fetched.get(hash) {
            Some(compressed) => repository::inflate(compressed, LIMIT).ok()?,
            None => repository::read(self.local, identity, LIMIT, &mut 0).ok()?,
        };
        let (_, body) = repository::split(&raw, identity, kind).ok()?;
        Some(body.to_vec())
    }
}

const LIMIT: usize = 32 * 1024 * 1024;

/// `scope/name@version` of a flattened dependency.
fn dependency_id(value: &Value) -> Option<String> {
    if let Some(text) = value
        .as_str()
        .or_else(|| value["id"].as_str())
    {
        return Some(text.to_owned());
    }
    let inner = value
        .get("id")
        .filter(|val| val.is_object())
        .unwrap_or(value);
    let scope = inner["scope"]
        .as_str()
        .or_else(|| value["scope"].as_str())
        .filter(|val| !val.is_empty())?;
    let raw_name = inner["name"]
        .as_str()
        .or_else(|| value["name"].as_str())
        .filter(|val| !val.is_empty())?;
    let (name, inline_ver) = raw_name
        .rsplit_once('@')
        .map_or((raw_name, None), |(bare, ver)| (bare, Some(ver).filter(|ver| !ver.is_empty())));
    let ver = inner["version"]
        .as_str()
        .or_else(|| value["version"].as_str())
        .or_else(|| inner["head"].as_str())
        .or_else(|| value["head"].as_str())
        .filter(|val| !val.is_empty())
        .or(inline_ver)?;
    Some(format!("{scope}/{name}@{ver}"))
}

#[cfg(test)]
mod tests;
