//! Which ids to ask remotes for (`ImportComponents._importComponentsObjects`):
//! first the latest heads (`importWithoutDeps` with `fetchHeadIfLocalIsBehind`),
//! then the `.bitmap` versions that are missing or incomplete locally
//! (`importMany` and `findMissingExternalsRecursively`), then the flattened
//! dependencies of versions that have no dependency graph.

use super::{
    bitmap::Id,
    fetch::{FetchOptions, Fetcher},
    fs_remote::resolve_version,
    lane::RemoteLane,
    objects::{Repo, component_hash},
    persist::{MAIN, Written, persist},
};
use indexmap::IndexMap;
use serde_json::Value;
use std::io;

/// One import run against the workspace scope.
pub struct Importer<'a> {
    pub repo: &'a Repo,
    pub fetcher: &'a Fetcher<'a>,
    /// The workspace scope name: ids of this scope are local, never fetched.
    pub local_scope: &'a str,
    pub lane: Option<&'a RemoteLane>,
}

impl Importer<'_> {
    /// Import `ids` and return what was written.
    pub async fn import(&self, ids: &[Id]) -> io::Result<Written> {
        let externals: Vec<Id> = ids
            .iter()
            .filter(|id| id.scope != self.local_scope)
            .cloned()
            .collect();
        let mut written = self.import_latest(&externals).await?;
        let (missing, unbuilt) = self.missing_versions(&externals)?;
        let only_if_built = !missing.is_empty()
            && missing
                .iter()
                .all(|id| unbuilt.contains(id));
        let options = FetchOptions::with_dependencies(self.lane_id(), only_if_built);
        add(&mut written, self.fetch(&missing, &options).await?);
        let dependencies = self.missing_dependencies(&missing)?;
        let options = FetchOptions::without_dependencies(self.lane_id());
        add(&mut written, self.fetch(&dependencies, &options).await?);
        Ok(written)
    }

    /// `importWithoutDeps(ids.toVersionLatest(), { fetchHeadIfLocalIsBehind: true })`.
    async fn import_latest(&self, ids: &[Id]) -> io::Result<Written> {
        let mut requests = Vec::with_capacity(ids.len());
        for id in ids {
            requests.push(id.with_version(self.known_remote_head(id)?));
        }
        self.fetch(&requests, &FetchOptions::latest(self.lane_id(), true)).await
    }

    /// The remote head recorded locally, when its Version object exists.
    fn known_remote_head(&self, id: &Id) -> io::Result<Option<String>> {
        if !self.repo.exists(&component_hash(&id.scope, &id.name)) {
            return Ok(None);
        }
        let (scope, lane) = match self.lane {
            Some(lane) => (lane.id.scope.as_str(), lane.id.name.as_str()),
            None => (id.scope.as_str(), MAIN),
        };
        let refs = self.repo.remote_refs(scope, lane)?;
        let head = refs
            .into_iter()
            .find(|entry| entry.scope == id.scope && entry.name == id.name);
        Ok(head
            .map(|entry| entry.head)
            .filter(|head| self.repo.exists(head)))
    }

    /// Versioned ids whose Version, build, or dependencies are not complete
    /// locally. The second list holds those only missing a successful build.
    fn missing_versions(&self, ids: &[Id]) -> io::Result<(Vec<Id>, Vec<Id>)> {
        let mut missing = Vec::new();
        let mut unbuilt = Vec::new();
        for id in ids.iter().filter(|id| id.version.is_some()) {
            match self.local_state(id)? {
                Local::Complete => {}
                Local::Unbuilt => {
                    unbuilt.push(id.clone());
                    missing.push(id.clone());
                }
                Local::Missing => missing.push(id.clone()),
            }
        }
        Ok((missing, unbuilt))
    }

    fn local_state(&self, id: &Id) -> io::Result<Local> {
        let Some(version) = self.local_version(id)? else { return Ok(Local::Missing) };
        if !matches!(version["buildStatus"].as_str(), None | Some("succeed" | "skipped")) {
            return Ok(Local::Unbuilt);
        }
        if self.has_graph(&version)? || self.flattened_exist(&version) {
            return Ok(Local::Complete);
        }
        Ok(Local::Missing)
    }

    fn local_version(&self, id: &Id) -> io::Result<Option<Value>> {
        let Some(component) = self.repo.read_json(&component_hash(&id.scope, &id.name))? else {
            return Ok(None);
        };
        let Some(hash) =
            id.version.as_deref().and_then(|version| resolve_version(&component, version))
        else {
            return Ok(None);
        };
        self.repo.read_json(&hash)
    }

    /// `Version.getFlattenedEdges()` is not empty.
    fn has_graph(&self, version: &Value) -> io::Result<bool> {
        let Some(reference) = version["flattenedEdgesRef"].as_str() else {
            return Ok(version["flattenedEdges"]
                .as_array()
                .is_some_and(|edges| !edges.is_empty()));
        };
        let edges = self.repo
            .read(reference)?
            .and_then(|edges| serde_json::from_slice::<Value>(&edges.content).ok());
        Ok(edges
            .and_then(|edges| {
                edges
                    .as_array()
                    .map(|edges| !edges.is_empty())
            })
            .unwrap_or(false))
    }

    fn flattened_exist(&self, version: &Value) -> bool {
        flattened(version)
            .iter()
            .all(|dependency| {
                self.repo.exists(&component_hash(&dependency.scope, &dependency.name))
            })
    }

    /// Flattened dependencies of fetched versions without a dependency graph
    /// whose versions are missing or unbuilt locally (`importWithoutDeps` with
    /// `cache`, through `sources.getMany(ids, true)`).
    fn missing_dependencies(&self, fetched: &[Id]) -> io::Result<Vec<Id>> {
        let mut dependencies: Vec<Id> = Vec::new();
        for id in fetched {
            let Some(version) = self.local_version(id)? else { continue };
            if self.has_graph(&version)? {
                continue;
            }
            for dependency in flattened(&version) {
                if self.needs_dependency(&dependency, &dependencies)? {
                    dependencies.push(dependency);
                }
            }
        }
        Ok(dependencies)
    }

    /// A remote dependency not yet queued whose local Version is missing or unbuilt.
    fn needs_dependency(&self, dependency: &Id, queued: &[Id]) -> io::Result<bool> {
        if dependency.scope == self.local_scope || queued.contains(dependency) {
            return Ok(false);
        }
        Ok(!matches!(self.local_build(dependency)?, Some(true)))
    }

    /// Whether the local Version of `id` was built; `None` when it is missing.
    fn local_build(&self, id: &Id) -> io::Result<Option<bool>> {
        let version = self.local_version(id)?;
        Ok(version.map(|version| {
            matches!(version["buildStatus"].as_str(), None | Some("succeed" | "skipped"))
        }))
    }

    async fn fetch(&self, ids: &[Id], options: &FetchOptions) -> io::Result<Written> {
        if ids.is_empty() {
            return Ok(Written::default());
        }
        let fetched = self.fetcher.fetch(&self.group(ids), options).await?;
        persist(self.repo, &fetched)
    }

    /// `groupByLanes` on a lane, otherwise `groupByScopeName`.
    fn group(&self, ids: &[Id]) -> IndexMap<String, Vec<String>> {
        let mut grouped: IndexMap<String, Vec<String>> = IndexMap::new();
        for id in ids {
            let scope = match self.lane {
                Some(lane) if lane.contains(id) => &lane.id.scope,
                _ => &id.scope,
            };
            grouped
                .entry(scope.clone())
                .or_default()
                .push(id.to_request());
        }
        grouped
    }

    fn lane_id(&self) -> Option<String> {
        self.lane.map(|lane| lane.id.to_request())
    }
}

enum Local {
    Complete,
    /// The Version exists but its build did not succeed (`reFetchUnBuiltVersion`).
    Unbuilt,
    Missing,
}

fn flattened(version: &Value) -> Vec<Id> {
    version["flattenedDependencies"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|dependency| {
            Some(Id {
                scope: dependency["scope"].as_str()?.to_string(),
                name: dependency["name"].as_str()?.to_string(),
                version: dependency["version"].as_str().map(str::to_string),
            })
        })
        .collect()
}

fn add(total: &mut Written, more: Written) {
    total.objects += more.objects;
    total.components.extend(more.components);
}
