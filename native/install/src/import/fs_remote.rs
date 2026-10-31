//! The `file://` remote: what a bare scope's `fetch` (`scope-api/lib/fetch.ts` with
//! `ObjectsReadableGenerator`) returns, computed directly from its objects.

use super::{
    bitmap::Id,
    fetch::FetchOptions,
    objects::{
        Repo, component_hash, compress_json, invalid, is_hash, sha1_hex, version_history_hash,
    },
    tar::ObjectItem,
};
use serde_json::{Value, json};
use std::{collections::HashSet, fs, io, path::Path};

/// Serve one fetch request from the bare scope at `path`.
pub fn fetch(path: &Path, ids: &[String], options: &FetchOptions) -> io::Result<Vec<ObjectItem>> {
    let scope_json: Value = match fs::read(path.join("scope.json")) {
        Ok(bytes) => {
            bit_object_import::parse_jsonc(&bytes).map_err(|_| invalid("invalid scope.json"))?
        }
        Err(error) if error.kind() == io::ErrorKind::NotFound => {
            return Err(io::Error::new(
                io::ErrorKind::NotFound,
                format!("error: scope not found at {}", path.display()),
            ));
        }
        Err(error) => return Err(error),
    };
    let name = scope_json["name"].as_str().ok_or_else(|| invalid("scope.json without a name"))?;
    let mut collector =
        Collector { repo: Repo::new(path), items: Vec::new(), pushed: HashSet::new() };
    if options.kind == "lane" {
        for id in ids {
            collector.push_lane(name, id)?;
        }
        return Ok(collector.items);
    }
    collector.push_scope_meta(name)?;
    let lane = options.lane_id
        .as_deref()
        .map(|lane| find_lane(&collector.repo, lane))
        .transpose()?
        .flatten();
    for id in ids {
        collector.push_requested(&Id::parse(id)?, lane.as_ref(), options)?;
    }
    Ok(collector.items)
}

struct Collector {
    repo: Repo,
    items: Vec<ObjectItem>,
    pushed: HashSet<String>,
}

/// A component and the hash of the version to send.
struct Selected {
    component: Value,
    hash: String,
}

impl Collector {
    fn push_raw(&mut self, hash: &str) -> io::Result<()> {
        if self.pushed.contains(hash) {
            return Ok(());
        }
        // Missing referenced objects are skipped, like `loadManyRaw` with `throws: false`.
        if let Some(compressed) = self.repo.read_raw(hash)? {
            self.pushed.insert(hash.to_string());
            self.items.push(ObjectItem { hash: hash.to_string(), compressed, scope: None });
        }
        Ok(())
    }

    /// `Repository.getScopeMetaObject()`.
    fn push_scope_meta(&mut self, name: &str) -> io::Result<()> {
        let hash = sha1_hex(name);
        let compressed = compress_json("ScopeMeta", &hash, &json!({ "name": name }))?;
        self.pushed.insert(hash.clone());
        self.items.push(ObjectItem { hash, compressed, scope: None });
        Ok(())
    }

    fn push_lane(&mut self, scope: &str, lane: &str) -> io::Result<()> {
        let name = lane.rsplit_once('/').map_or(lane, |(_, name)| name);
        let hash = lane_hash(&self.repo, lane)?
            .ok_or_else(|| {
                io::Error::new(
                    io::ErrorKind::NotFound,
                    format!(r#"lane "{name}" was not found in scope "{scope}""#),
                )
            })?;
        self.push_raw(&hash)
    }

    /// One requested id of a `component` fetch, with its dependencies when asked.
    fn push_requested(
        &mut self,
        id: &Id,
        lane: Option<&Value>,
        options: &FetchOptions,
    ) -> io::Result<()> {
        let (requested, stop_at) = requested_id(id, lane, options);
        let Some(selected) = self.select(&requested, options.selection.ignore_missing_head)? else {
            return Ok(());
        };
        if stop_at.is_some_and(|stop| reached_head(&selected, &stop)) {
            return Ok(());
        }
        let version = self.load_version(&selected)?;
        if options.traversal.only_if_built && !is_built(&version) {
            return Ok(());
        }
        self.push_component(
            &requested,
            &selected,
            &version,
            options.traversal.include_version_history,
        )?;
        if options.traversal.include_dependencies
            && !(options.traversal.prefer_dependency_graph && self.has_graph(&version)?)
        {
            self.push_dependencies(&version)?;
        }
        Ok(())
    }

    fn select(&self, id: &Id, ignore_missing_head: bool) -> io::Result<Option<Selected>> {
        let Some(component) = self.repo.read_json(&component_hash(&id.scope, &id.name))? else {
            return Ok(None);
        };
        let hash = match &id.version {
            Some(version) => resolve_version(&component, version),
            None if ignore_missing_head && component["head"].is_null() => None,
            None => latest(&component),
        };
        Ok(hash.map(|hash| Selected { component, hash }))
    }

    fn load_version(&self, selected: &Selected) -> io::Result<Value> {
        self.repo
            .read_json(&selected.hash)?
            .ok_or_else(|| {
                let name = selected.component["name"].as_str().unwrap_or_default();
                io::Error::other(format!("failed loading version {} of {name}", selected.hash))
            })
    }

    fn push_component(
        &mut self,
        id: &Id,
        selected: &Selected,
        version: &Value,
        history: bool,
    ) -> io::Result<()> {
        self.push_raw(&component_hash(&id.scope, &id.name))?;
        if history {
            self.push_raw(&version_history_hash(&id.scope, &id.name))?;
        }
        for reference in version_refs(version) {
            self.push_raw(&reference)?;
        }
        self.push_raw(&selected.hash)
    }

    /// `flattenedDependencies` and `flattenedDevDependencies` of a version without a dependency graph.
    fn push_dependencies(&mut self, version: &Value) -> io::Result<()> {
        let dependencies: Vec<Value> = ["flattenedDependencies", "flattenedDevDependencies"]
            .into_iter()
            .filter_map(|field| version[field].as_array())
            .flatten()
            .cloned()
            .collect();
        for dependency in &dependencies {
            let Some(id) = dependency_id(dependency) else { continue };
            let Some(selected) = self.select(&id, false)? else { continue };
            let Some(version) = self.repo.read_json(&selected.hash)? else { continue };
            self.push_component(&id, &selected, &version, false)?;
        }
        Ok(())
    }

    /// `Version.getFlattenedEdges()` is not empty.
    fn has_graph(&self, version: &Value) -> io::Result<bool> {
        if let Some(reference) = version["flattenedEdgesRef"].as_str() {
            let Some(edges) = self.repo.read(reference)? else { return Ok(false) };
            return Ok(bit_object_import::parse_jsonc(&edges.content)
                .ok()
                .and_then(|edges| {
                    edges
                        .as_array()
                        .map(|edges| !edges.is_empty())
                })
                .unwrap_or(false));
        }
        Ok(version["flattenedEdges"]
            .as_array()
            .is_some_and(|edges| !edges.is_empty()))
    }
}

/// `ModelComponent.getRef(version)`: a tag (also orphaned) or a snap hash.
#[must_use]
pub fn resolve_version(component: &Value, version: &str) -> Option<String> {
    if matches!(version, "latest" | "head") {
        return latest(component);
    }
    if let Some(hash) = component["versions"][version]
        .as_str()
        .or_else(|| component["orphanedVersions"][version].as_str())
    {
        return Some(hash.to_string());
    }
    is_hash(version).then(|| version.to_string())
}

/// `toComponentVersion(undefined)`: the head, else the latest tag.
fn latest(component: &Value) -> Option<String> {
    if let Some(head) = component["head"].as_str() {
        return Some(head.to_string());
    }
    let versions = component["versions"].as_object()?;
    let orphaned = component["orphanedVersions"].as_object();
    let (_, tag) = versions
        .keys()
        .chain(orphaned.into_iter().flat_map(serde_json::Map::keys))
        .filter_map(|tag| {
            node_semver::Version::parse(tag)
                .ok()
                .map(|parsed| (parsed, tag))
        })
        .max_by(|(left, _), (right, _)| left.cmp(right))?;
    versions
        .get(tag.as_str())
        .or_else(|| orphaned.and_then(|map| map.get(tag.as_str())))
        .and_then(Value::as_str)
        .map(str::to_string)
}

/// `Version.refsWithOptions(false, false)`.
fn version_refs(version: &Value) -> Vec<String> {
    let files = version["files"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|file| file["file"].as_str());
    let graphs = ["flattenedEdgesRef", "dependenciesGraphRef", "flattenedDependenciesRef"]
        .into_iter()
        .filter_map(|key| version[key].as_str());
    files
        .chain(graphs)
        .map(str::to_string)
        .collect()
}

fn is_built(version: &Value) -> bool {
    matches!(version["buildStatus"].as_str(), Some("succeed" | "skipped"))
}

pub(super) fn dependency_id(value: &Value) -> Option<Id> {
    if let Some(raw) = value
        .as_str()
        .or_else(|| value["id"].as_str())
    {
        return Id::parse(raw).ok();
    }
    let target = value
        .get("id")
        .filter(|id| id.is_object())
        .unwrap_or(value);
    let raw_name = target["name"]
        .as_str()
        .or_else(|| value["name"].as_str())
        .filter(|val| !val.is_empty())?;
    let (name, inline_ver) = raw_name
        .rsplit_once('@')
        .map_or((raw_name, None), |(base, ver)| (base, Some(ver)));
    let version = target["version"]
        .as_str()
        .or_else(|| value["version"].as_str())
        .or_else(|| target["head"].as_str())
        .or_else(|| value["head"].as_str())
        .or(inline_ver)
        .filter(|val| !val.is_empty() && !matches!(*val, "latest" | "head"))
        .map(str::to_string);
    Some(Id {
        scope: target["scope"]
            .as_str()
            .or_else(|| value["scope"].as_str())
            .filter(|val| !val.is_empty())?
            .to_string(),
        name: name.to_string(),
        version,
    })
}

fn lane_hash(repo: &Repo, lane: &str) -> io::Result<Option<String>> {
    let index: Value = match fs::read(repo.root().join("index.json")) {
        Ok(bytes) => {
            bit_object_import::parse_jsonc(&bytes).map_err(|_| invalid("invalid scope index.json"))?
        }
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(error),
    };
    let (lane_scope, name) = lane
        .rsplit_once('/')
        .map_or((None, lane), |(sc, nm)| (Some(sc), nm));
    Ok(index["lanes"]
        .as_array()
        .into_iter()
        .flatten()
        .find(|row| matches_id_scope_name(&row["id"], lane_scope, name))
        .and_then(|row| row["hash"].as_str())
        .map(str::to_string))
}

fn matches_id_scope_name(id: &Value, expected_scope: Option<&str>, expected_name: &str) -> bool {
    if let Some(raw) = id.as_str() {
        let bare = raw.rsplit_once('@').map_or(raw, |(base, _)| base);
        let (sc, nm) = bare
            .split_once('/')
            .map_or((None, bare), |(sc, nm)| (Some(sc), nm));
        return expected_scope.is_none_or(|exp| sc == Some(exp)) && nm == expected_name;
    }
    expected_scope.is_none_or(|sc| id["scope"].as_str() == Some(sc))
        && id["name"].as_str() == Some(expected_name)
}

fn find_lane(repo: &Repo, lane: &str) -> io::Result<Option<Value>> {
    match lane_hash(repo, lane)? {
        Some(hash) => repo.read_json(&hash),
        None => Ok(None),
    }
}

/// The lane head of a versionless id that the lane contains.
fn lane_head(lane: &Value, id: &Id) -> Option<Id> {
    if id.version
        .as_deref()
        .is_some_and(|ver| !ver.is_empty() && !matches!(ver, "latest" | "head"))
    {
        return None;
    }
    lane["components"]
        .as_array()?
        .iter()
        .find(|entry| matches_id_scope_name(&entry["id"], Some(&id.scope), &id.name))
        .and_then(|entry| entry["head"].as_str())
        .map(|head| id.with_version(Some(head.to_string())))
}

/// The id to serve for one requested id, and the version a `component-delta`
/// fetch stops at (`returnNothingIfGivenVersionExists`).
fn requested_id(id: &Id, lane: Option<&Value>, options: &FetchOptions) -> (Id, Option<String>) {
    let delta = options.selection.return_nothing_if_given_version_exists;
    let stop_at = if delta { id.version.clone() } else { None };
    let requested = if delta { id.with_version(None) } else { id.clone() };
    let requested = lane.and_then(|lane| lane_head(lane, &requested)).unwrap_or(requested);
    (requested, stop_at)
}

/// The client already has the selected head.
fn reached_head(selected: &Selected, stop: &str) -> bool {
    resolve_version(&selected.component, stop).as_deref() == Some(selected.hash.as_str())
}
