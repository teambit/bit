//! The capture of the current workspace, shared by status, diff and the
//! workspace commands: each selected component's files and
//! dependencies, and the commit that writes what the command staged.

mod bitmap;
mod identities;
mod missing;

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
use bit_install::dependencies::cache::invalidation::{deps_dir, needs_invalidation};
use identities::{base_identity, dependency_identities, peer_identities};
use serde_json::{Value, json};
use std::{collections::HashMap, io, path::Path};

pub struct Capture {
    /// Every selected target: identity, version, directory, files, current
    /// metadata and peer dependencies.
    pub captured: Vec<Value>,
    pub comparisons: Vec<Value>,
    pub components: Vec<Component>,
    /// Bitmap targets whose directory is absent from the workspace.
    pub invalid: HashMap<String, Value>,
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
    /// Validate fresh reads, but never read from or write to the FS dependency cache.
    no_fs_cache: bool,
}

impl CacheWrites {
    /// `forceDependencyCacheReset`: the whole cache is replaced on commit.
    pub fn force_reset(&mut self) {
        self.reset = true;
    }

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
    /// Recovery reset may prove a changed file from hashes when source parsing fails.
    pub incomplete_reset: bool,
    /// A missing tracked directory is an empty current tree for `checkout reset`.
    pub missing_checkout_reset: bool,
    /// Status reports a missing tracked directory as an invalid component.
    pub missing_status_invalid: bool,
}

impl CaptureOptions {
    fn scan_behavior(&self) -> ScanBehavior {
        ScanBehavior {
            verify: self.verify,
            incomplete_reset: self.incomplete_reset,
            missing_checkout_reset: self.missing_checkout_reset,
            missing_status_invalid: self.missing_status_invalid,
        }
    }
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

/// The capture with the write commands' options.
pub fn capture_with(
    engine: &mut Engine,
    root: &Path,
    home: &Path,
    context: &Value,
    targets: &[Value],
    capture_options: CaptureOptions,
) -> io::Result<Capture> {
    if !capture_options.missing_status_invalid && bitmap::has_special_state(targets) {
        return Err(decline("bitmap state requires the canonical workspace command"));
    }
    let options: Options =
        serde_json::from_value(context["options"].clone()).map_err(io::Error::other)?;
    let inventory = Inventory::new(&options)?;
    let no_fs_cache = cache::no_fs_cache(root);
    let reset = !no_fs_cache
        && !targets.is_empty()
        && (capture_options.reset || needs_invalidation(root, &deps_dir(root))?);
    let behavior = capture_options.scan_behavior();
    let mut captured = Capture {
        captured: Vec::new(),
        comparisons: Vec::new(),
        components: Vec::new(),
        invalid: HashMap::new(),
        dependency_states: HashMap::new(),
        cache: CacheWrites {
            reset,
            no_fs_cache,
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
            behavior,
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
    behavior: ScanBehavior,
}

#[derive(Clone, Copy)]
struct ScanBehavior {
    verify: bool,
    incomplete_reset: bool,
    missing_checkout_reset: bool,
    missing_status_invalid: bool,
}

impl Scan<'_> {
    /// One target: its policy, its files, its dependencies.
    fn target(mut self, target: &Value, captured: &mut Capture) -> io::Result<()> {
        if self.behavior.missing_status_invalid && missing::status_removed(target, captured)? {
            return Ok(());
        }
        let policy = policy::status_policy(self.context, target)?;
        let directory = text(target.get("directory"))?;
        if self.behavior.missing_status_invalid
            && missing::status_invalid(self.root, target, directory, captured)?
        {
            return Ok(());
        }
        if missing::capture(
            self.root,
            self.behavior.missing_checkout_reset,
            target,
            directory,
            captured,
        )? {
            return Ok(());
        }
        let files = self.files(directory)?;
        if self.behavior.missing_status_invalid
            && missing::status_invalid_files(self.root, target, directory, &files, captured)?
        {
            return Ok(());
        }
        if missing::main_file(
            self.root,
            self.behavior.missing_checkout_reset,
            target,
            directory,
            &files,
            captured,
        )? {
            return Ok(());
        }
        let Some(dependencies) = self.dependencies(target, directory, &files, &policy, captured)?
        else {
            return Ok(());
        };
        record(target, directory, &files, &policy, &dependencies, captured)
    }

    fn dependencies(
        &mut self,
        target: &Value,
        directory: &str,
        files: &[String],
        policy: &policy::Policy,
        captured: &mut Capture,
    ) -> io::Result<Option<Value>> {
        let mut dependencies =
            if captured.cache.no_fs_cache || (captured.cache.reset && directory != ".") {
                json!({ "needsDetection": true })
            } else {
                self.cached(target, directory, files, policy)?
            };
        if dependencies.get("needsDetection") == Some(&Value::Bool(true)) {
            let (detected, pending) = match self.detect(target, files, policy) {
                Ok(value) => value,
                Err(error)
                    if self.behavior.incomplete_reset
                        && error
                            .to_string()
                            .contains(
                                "dependency graph extraction requires canonical fallback",
                            ) =>
                {
                    missing::record_incomplete(target, directory, files, captured)?;
                    return Ok(None);
                }
                Err(error) => return Err(error),
            };
            dependencies = detected;
            captured.cache.pending.push(pending);
        } else if self.behavior.verify {
            let (detected, pending) = self.verified(target, files, policy, &dependencies)?;
            dependencies = detected;
            captured.cache.pending.push(pending);
        }
        Ok(Some(dependencies))
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
        fresh::commit(engine, root, &entries, capture.cache.reset, !capture.cache.no_fs_cache)?;
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
