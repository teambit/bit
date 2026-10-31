//! Which ids to ask remotes for (`ImportComponents._importComponentsObjects`):
//! first the latest heads (`importWithoutDeps` with `fetchHeadIfLocalIsBehind`),
//! then the `.bitmap` versions that are missing or incomplete locally
//! (`importMany` and `findMissingExternalsRecursively`), retried from their
//! own scopes when the lane lacks them, then the flattened dependencies of
//! versions that have no dependency graph.

use super::{
    bitmap::Id,
    fetch::{FetchOptions, Fetcher},
    fs_remote::resolve_version,
    history,
    lane::RemoteLane,
    objects::{Repo, component_hash},
    persist::{MAIN, Progress, Written, persist},
};
use crate::output::Output;
use indexmap::IndexMap;
use serde_json::Value;
use std::{collections::HashSet, io};

/// `importMany`'s reason for `bit install`.
const MISSING_REASON: &str = "for getting missing versions and dependencies";
/// `getExternalMany`'s reason for flattened dependencies without a graph.
const FLATTENED_REASON: &str =
    "which are flattened dependencies of components that don't have dependency-graph";

/// One import run against the workspace scope.
pub struct Importer<'a> {
    pub repo: &'a Repo,
    pub fetcher: &'a Fetcher<'a>,
    /// The workspace scope name: ids of this scope are local, never fetched.
    pub local_scope: &'a str,
    pub lane: Option<&'a RemoteLane>,
    /// Where the `ObjectFetcher` loader messages go; `None` keeps the import silent.
    pub output: Option<&'a Output>,
    /// `BIT_FETCH_INCOMPLETE_VERSION_HISTORY`: also fetch components whose local
    /// `VersionHistory` is incomplete since the requested version.
    pub refetch_incomplete_history: bool,
}

impl Importer<'_> {
    /// Import `ids` and return what was written.
    pub async fn import(&self, ids: &[Id]) -> io::Result<Written> {
        if ids.is_empty() {
            return Ok(Written::default());
        }
        let externals: Vec<Id> = ids
            .iter()
            .filter(|id| id.scope != self.local_scope)
            .cloned()
            .collect();
        let mut written = self.import_latest(&externals).await?;
        self.status(&format!(
            "import {} components with their dependencies (if missing)",
            ids.len(),
        ));
        let (mut missing, unbuilt) = self.missing_versions(&externals)?;
        if self.refetch_incomplete_history {
            for id in history::incomplete(self.repo, &externals)? {
                if !missing.contains(&id) {
                    missing.push(id);
                }
            }
        }
        let only_if_built = !missing.is_empty()
            && missing
                .iter()
                .all(|id| unbuilt.contains(id));
        let options = FetchOptions::with_dependencies(self.lane_id(), only_if_built);
        add(&mut written, self.fetch(&missing, &options, MISSING_REASON).await?);
        add(&mut written, self.retry_from_main(&missing, only_if_built).await?);
        let dependencies = self.missing_dependencies(&missing)?;
        let options = FetchOptions::without_dependencies(self.lane_id());
        add(&mut written, self.fetch(&dependencies, &options, FLATTENED_REASON).await?);
        Ok(written)
    }

    /// `importWithoutDeps(ids.toVersionLatest(), { fetchHeadIfLocalIsBehind: true })`.
    async fn import_latest(&self, ids: &[Id]) -> io::Result<Written> {
        let mut requests = Vec::with_capacity(ids.len());
        for id in ids {
            requests.push(id.with_version(self.known_remote_head(id)?));
        }
        let reason = match self.lane {
            Some(lane) => format!("of their latest on lane {}", lane.id.to_request()),
            None => "of their latest on main".to_string(),
        };
        self.fetch(&requests, &FetchOptions::latest(self.lane_id(), true), &reason).await
    }

    /// `importMany` on a lane: ids the lane's remote did not return are fetched
    /// again from their own scopes (`fromMainOnly`), ignoring unavailable scopes.
    async fn retry_from_main(&self, missing: &[Id], only_if_built: bool) -> io::Result<Written> {
        if self.lane.is_none() {
            return Ok(Written::default());
        }
        let mut still_missing = Vec::new();
        for id in missing {
            if self.local_version(id)?.is_none() {
                still_missing.push(id.clone());
            }
        }
        if still_missing.is_empty() {
            return Ok(Written::default());
        }
        let options = FetchOptions::with_dependencies(None, only_if_built);
        let reason = format!("{MISSING_REASON} (retrying from original scope)");
        self.fetch_grouped(&still_missing, group_by_scope(&still_missing), &options, &reason).await
    }

    /// The remote head recorded locally, when its Version object exists.
    fn known_remote_head(&self, id: &Id) -> io::Result<Option<String>> {
        if !self.repo.exists(&component_hash(&id.scope, &id.name)) {
            return Ok(None);
        }
        let (scope, lane) = match self.lane {
            Some(lane) => (lane.id.scope.trim(), lane.id.name.trim()),
            None => (id.scope.trim(), MAIN),
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
        let Some(reference) = version["flattenedEdgesRef"]
            .as_str()
            .map(str::trim)
            .filter(|reference| !reference.is_empty())
        else {
            return Ok(version["flattenedEdges"]
                .as_array()
                .is_some_and(|edges| !edges.is_empty()));
        };
        let edges = self.repo
            .read(reference)?
            .and_then(|edges| bit_object_import::parse_jsonc(&edges.content).ok());
        Ok(edges.is_some_and(|edges| {
            edges
                .as_array()
                .is_some_and(|list| !list.is_empty())
        }))
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

    async fn fetch(&self, ids: &[Id], options: &FetchOptions, reason: &str) -> io::Result<Written> {
        self.fetch_grouped(ids, self.group(ids), options, reason).await
    }

    /// `ObjectFetcher.fetchFromRemoteAndWrite` with its loader messages.
    async fn fetch_grouped(
        &self,
        ids: &[Id],
        grouped: IndexMap<String, Vec<String>>,
        options: &FetchOptions,
        reason: &str,
    ) -> io::Result<Written> {
        if ids.is_empty() {
            return Ok(Written::default());
        }
        let message = format!("importing {} {reason}", ids_message(ids));
        self.status(&message);
        let progress = self.output.and_then(|output| Progress::new(output, &message));
        let fetched = self.fetcher.fetch(&grouped, options).await?;
        let written = persist(self.repo, &fetched, progress.as_ref())?;
        let imported = match written.components.len() {
            0 => format!(
                "{} objects",
                fetched
                    .values()
                    .map(Vec::len)
                    .sum::<usize>(),
            ),
            components => format!("{components} components"),
        };
        self.status(&format!("successfully imported {imported} {reason}"));
        Ok(written)
    }

    fn status(&self, text: &str) {
        if let Some(output) = self.output {
            output.status(text);
        }
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

/// `groupByScopeName`: each id from its own scope.
fn group_by_scope(ids: &[Id]) -> IndexMap<String, Vec<String>> {
    let mut grouped: IndexMap<String, Vec<String>> = IndexMap::new();
    for id in ids {
        grouped
            .entry(id.scope.clone())
            .or_default()
            .push(id.to_request());
    }
    grouped
}

/// `getIdsMsg()`: `N components`, or `N components, M versions` when some
/// component is requested at more than one version.
fn ids_message(ids: &[Id]) -> String {
    let unique: HashSet<String> = ids
        .iter()
        .map(Id::without_version)
        .collect();
    if unique.len() == ids.len() {
        return format!("{} components", ids.len());
    }
    format!("{} components, {} versions", unique.len(), ids.len())
}

enum Local {
    Complete,
    /// The Version exists but its build did not succeed (`reFetchUnBuiltVersion`).
    Unbuilt,
    Missing,
}

fn flattened(version: &Value) -> Vec<Id> {
    ["flattenedDependencies", "flattenedDevDependencies"]
        .into_iter()
        .filter_map(|field| version[field].as_array())
        .flatten()
        .filter_map(super::fs_remote::dependency_id)
        .collect()
}

fn add(total: &mut Written, more: Written) {
    total.objects += more.objects;
    total.components.extend(more.components);
}
