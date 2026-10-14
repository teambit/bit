//! `captureRustClientCurrent` of the Node.js glue (`rust-client-capture.ts`),
//! shared by status and diff: each selected component's files and
//! dependencies, and the commit that writes what the command staged.

use super::{
    cache, fresh,
    issues::Component,
    js::{self, array, decline, full_identity, text},
    policy,
};
use crate::commands::{
    engine::Engine,
    inventory::{Inventory, Options},
};
use serde_json::{Value, json};
use std::{collections::HashMap, io, path::Path};

pub struct Capture {
    /// Every selected target: identity, version, directory, files, current
    /// metadata and peer dependencies.
    pub captured: Vec<Value>,
    pub comparisons: Vec<Value>,
    pub components: Vec<Component>,
    /// `retainDependencyState`: each target's dependency state, by identity.
    pub dependency_states: HashMap<String, Value>,
    /// What the commit writes to the dependency cache.
    pub cache: CacheWrites,
}

/// The dependency cache entries a capture's commit writes.
#[derive(Default)]
pub struct CacheWrites {
    /// Fresh detections whose cache entries are written on commit.
    pending: Vec<fresh::Pending>,
    /// `dependencyCacheNeedsInvalidation`: every nested component is detected
    /// afresh and the whole cache is replaced on commit.
    reset: bool,
    /// Cache entries the command computed for a projected version; they
    /// replace the pending entries of the same component.
    pub replacements: Vec<fresh::Pending>,
    /// Only the replacements are written: a merge whose snap failed.
    pub replacements_only: bool,
    /// `dependencyCacheVersions`: the version a pending entry is written under.
    versions: HashMap<String, String>,
}

impl CacheWrites {
    fn is_empty(&self) -> bool {
        self.pending.is_empty() && self.replacements.is_empty() && !self.reset
    }

    /// The pending entries under their written versions, unless replaced,
    /// then the replacements.
    fn entries(&self) -> Vec<fresh::Pending> {
        let replaced: Vec<&str> = self.replacements
            .iter()
            .map(|entry| base_identity(entry.identity()))
            .collect();
        let pending = self.pending
            .iter()
            .filter(|_| !self.replacements_only)
            .map(|entry| {
                let identity = base_identity(entry.identity());
                self.versions
                    .get(identity)
                    .map_or_else(
                        || entry.clone(),
                        |version| entry.renamed(format!("{identity}@{version}")),
                    )
            });
        pending
            .filter(|entry| !replaced.contains(&base_identity(entry.identity())))
            .chain(self.replacements.iter().cloned())
            .collect()
    }
}

/// The `captureOptions` of the write commands.
#[derive(Default)]
pub struct CaptureOptions {
    /// `verifyFreshDependencies`: cached dependencies are detected again,
    /// and any difference declines.
    pub verify: bool,
    /// `resetDependencyCache`: the whole cache is replaced on commit.
    pub reset: bool,
    /// `dependencyCacheVersions`, by identity.
    pub cache_versions: HashMap<String, String>,
}

impl Capture {
    /// `capture.dependencyReadSet`: the read sets of every fresh detection.
    pub fn dependency_read_set(&self) -> Vec<Value> {
        self.cache.pending
            .iter()
            .flat_map(|entry| entry.read_set().iter().cloned())
            .collect()
    }
}

/// `captureRustClientCurrent(root, context, request, targets)`: each selected
/// component's files and dependencies, from the cache or detected afresh.
pub fn capture(
    engine: &mut Engine,
    root: &Path,
    home: &Path,
    context: &Value,
    targets: &[Value],
) -> io::Result<Capture> {
    capture_with(engine, root, home, context, targets, CaptureOptions::default())
}

/// `captureRustClientCurrent` with the write commands' `captureOptions`.
pub fn capture_with(
    engine: &mut Engine,
    root: &Path,
    home: &Path,
    context: &Value,
    targets: &[Value],
    capture_options: CaptureOptions,
) -> io::Result<Capture> {
    let options: Options =
        serde_json::from_value(context["options"].clone()).map_err(io::Error::other)?;
    let inventory = Inventory::new(&options)?;
    let reset = !targets.is_empty() && (capture_options.reset || cache::needs_invalidation(root)?);
    let verify = capture_options.verify;
    let mut captured = Capture {
        captured: Vec::new(),
        comparisons: Vec::new(),
        components: Vec::new(),
        dependency_states: HashMap::new(),
        cache: CacheWrites {
            reset,
            versions: capture_options.cache_versions,
            ..CacheWrites::default()
        },
    };
    let mut facts = None;
    for target in targets {
        let scan = Scan {
            engine: &mut *engine,
            root,
            home,
            context,
            inventory: &inventory,
            facts: &mut facts,
            verify,
        };
        scan.target(target, &mut captured)?;
    }
    Ok(captured)
}

struct Scan<'s> {
    engine: &'s mut Engine,
    root: &'s Path,
    home: &'s Path,
    context: &'s Value,
    inventory: &'s Inventory,
    /// Loaded on the first fresh detection: it may run Node once.
    facts: &'s mut Option<fresh::Facts>,
    verify: bool,
}

impl Scan<'_> {
    /// One target: its policy, its files, its dependencies.
    fn target(mut self, target: &Value, captured: &mut Capture) -> io::Result<()> {
        let policy = policy::status_policy(self.context, target)?;
        let directory = text(target.get("directory"))?;
        let files = self.files(directory)?;
        let main_file = target.get("mainFile").and_then(Value::as_str);
        if !main_file.is_some_and(|main| files.iter().any(|file| file == main)) {
            return Err(decline("status main file not captured"));
        }
        let mut dependencies = if captured.cache.reset && directory != "." {
            json!({ "needsDetection": true })
        } else {
            self.cached(target, directory, &files, &policy)?
        };
        if dependencies.get("needsDetection") == Some(&Value::Bool(true)) {
            let (detected, pending) = self.detect(target, &files, &policy)?;
            dependencies = detected;
            captured.cache.pending.push(pending);
        } else if self.verify {
            let (detected, pending) = self.verified(target, &files, &policy, &dependencies)?;
            dependencies = detected;
            captured.cache.pending.push(pending);
        }
        record(target, directory, &files, &policy, &dependencies, captured)
    }

    /// `verifyFreshDependencies`: the cached dependencies detected again;
    /// any difference in metadata or issues declines.
    fn verified(
        &mut self,
        target: &Value,
        files: &[String],
        policy: &policy::Policy,
        cached: &Value,
    ) -> io::Result<(Value, fresh::Pending)> {
        let (detected, pending) = self.detect(target, files, policy)?;
        let current = |deps: &Value| {
            policy::current_metadata(target, policy, deps).map(|meta| meta.to_string())
        };
        let issues = |deps: &Value| deps.get("issues").map(Value::to_string);
        if current(&detected)? != current(cached)? || issues(&detected) != issues(cached) {
            return Err(decline("cached dependencies differ from a fresh detection"));
        }
        Ok((detected, pending))
    }

    /// `dependencyPolicyCached`.
    fn cached(
        &mut self,
        target: &Value,
        directory: &str,
        files: &[String],
        policy: &policy::Policy,
    ) -> io::Result<Value> {
        let component_root = self.root.join(directory);
        let mut request = json!({
            "kind": "dependencyPolicyCached",
            "root": self.root,
            "componentRoot": component_root,
            "identity": full_identity(target)?,
            "files": files.iter().map(|file| component_root.join(file)).collect::<Vec<_>>(),
        });
        spread(&mut request, &policy.input)?;
        self.engine.request(&request)
    }

    /// `readFreshDependencies`.
    fn detect(
        &mut self,
        target: &Value,
        files: &[String],
        policy: &policy::Policy,
    ) -> io::Result<(Value, fresh::Pending)> {
        if self.facts.is_none() {
            *self.facts = Some(fresh::Facts::new(self.home)?);
        }
        let facts = self.facts.as_ref().ok_or_else(|| decline("status facts"))?;
        let detection = fresh::Detection { root: self.root, context: self.context, facts };
        detection.read(self.engine, target, files, policy)
    }

    /// The component's files, relative to its directory.
    fn files(&mut self, directory: &str) -> io::Result<Vec<String>> {
        let others: Vec<_> = if directory == "." {
            array(self.context.get("targets"), "targets")?
                .iter()
                .filter_map(|row| row.get("directory").and_then(Value::as_str))
                .filter(|dir| *dir != ".")
                .map(|dir| self.root.join(dir))
                .collect()
        } else {
            Vec::new()
        };
        let begin = json!({
            "kind": "inventoryBegin",
            "root": self.root.join(directory),
            "workspace": self.root,
            "excludeDirs": others,
        });
        let manifest = self.inventory.scan(self.engine, begin, "inventoryFinish")?;
        array(manifest.get("files"), "inventory files")?
            .iter()
            .map(|file| text(file.get("relativePath")).map(str::to_string))
            .collect()
    }
}

/// The comparison and component rows of one captured target.
fn record(
    target: &Value,
    directory: &str,
    files: &[String],
    policy: &policy::Policy,
    dependencies: &Value,
    captured: &mut Capture,
) -> io::Result<()> {
    let current = policy::current_metadata(target, policy, dependencies)?;
    let version = target
        .get("version")
        .cloned()
        .unwrap_or(Value::Null);
    let entry = json!({
        "identity": target["identity"],
        "version": version,
        "directory": directory,
        "files": files,
        "current": current,
    });
    captured.dependency_states.insert(
        text(target.get("identity"))?.to_string(),
        dependencies["state"].clone(),
    );
    let mut row = entry.clone();
    row["peerDependencies"] = json!(peer_identities(dependencies)?);
    captured.captured.push(row);
    if js::truthy(Some(&version)) {
        captured.comparisons.push(entry);
    }
    captured.components.push(Component {
        identity: full_identity(target)?,
        package_name: policy.package_name.clone(),
        dependencies: dependency_identities(dependencies)?,
        issues: dependencies
            .get("issues")
            .cloned()
            .unwrap_or(Value::Null),
    });
    Ok(())
}

/// `{ ...request, ...policy.input }`.
pub fn spread(request: &mut Value, input: &Value) -> io::Result<()> {
    let request = request.as_object_mut().ok_or_else(|| decline("status request"))?;
    for (key, value) in input.as_object().ok_or_else(|| decline("status policy input"))? {
        request.insert(key.clone(), value.clone());
    }
    Ok(())
}

/// The identities of the peer lifecycle.
fn peer_identities(dependencies: &Value) -> io::Result<Vec<String>> {
    let state = &dependencies["state"];
    let entries = array(state.get("entries"), "dependency entries")?;
    let lifecycles = array(state.get("components"), "dependency lifecycles")?;
    let peers = array(lifecycles.get(2), "peer dependencies")?;
    peers
        .iter()
        .map(|index| {
            let entry = index
                .as_u64()
                .and_then(|index| entries.get(index as usize));
            let entry = entry.ok_or_else(|| decline("status dependency entry"))?;
            text(entry.get("identity")).map(str::to_string)
        })
        .collect()
}

/// Every dependency identity, in lifecycle order.
fn dependency_identities(dependencies: &Value) -> io::Result<Vec<String>> {
    let state = &dependencies["state"];
    let entries = array(state.get("entries"), "dependency entries")?;
    let mut identities = Vec::new();
    for indices in array(state.get("components"), "dependency lifecycles")? {
        for index in array(Some(indices), "dependency indices")? {
            let entry = index
                .as_u64()
                .and_then(|index| entries.get(index as usize));
            let entry = entry.ok_or_else(|| decline("status dependency entry"))?;
            identities.push(text(entry.get("identity"))?.to_string());
        }
    }
    Ok(identities)
}

/// The identity without its `@version`.
fn base_identity(identity: &str) -> &str {
    identity
        .rfind('@')
        .map_or(identity, |separator| &identity[..separator])
}

/// `capture.commit()`: staged histories validated, dependency caches written,
/// then the histories written.
pub fn commit(
    engine: &mut Engine,
    root: &Path,
    context: &Value,
    capture: &Capture,
) -> io::Result<()> {
    let plans = array(context.get("pendingHistory"), "history plans")?;
    if !plans.is_empty() {
        let validated: Value = engine.request(
            &json!({"kind": "statusHistoryValidate", "root": root, "plans": plans}),
        )?;
        if validated.get("fresh") != Some(&Value::Bool(true)) {
            return Err(decline("status history changed"));
        }
    }
    if !capture.cache.is_empty() {
        let entries = capture.cache.entries();
        fresh::commit(engine, root, &entries, capture.cache.reset)?;
    }
    if plans.is_empty() {
        return Ok(());
    }
    let committed: Value =
        engine.request(&json!({"kind": "statusHistoryCommit", "root": root, "plans": plans}))?;
    let written = committed.get("written").and_then(Value::as_u64);
    if written.is_none_or(|written| written > plans.len() as u64) {
        return Err(decline("status history commit receipt"));
    }
    Ok(())
}
