//! The capture of the current workspace, shared by status, diff and the
//! workspace commands: each selected component's files and
//! dependencies, and the commit that writes what the command staged.

pub(in crate::commands) use callbacks::take_callback_environment;
pub use callbacks::{
    callback_issue_stdout, callback_load_stdout, callback_startup_stdout, issue_callbacks,
    workspace_issues,
};
pub use commit::{commit, commit_checkout_dependencies};
pub use snapshot::{
    snapshot_build, snapshot_control_reads, snapshot_data, snapshot_editor,
    snapshot_package_manifests, snapshot_pre_snap, snapshot_registry, snapshot_required,
    snapshot_workspace_issues,
};

mod bitmap;
mod callbacks;
mod commit;
mod dependencies;
mod identities;
mod missing;
mod order;
mod snapshot;
mod target;

use super::{
    cache,
    environments::Environments,
    fresh,
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
    /// Environment callbacks used by the native diagnostic checks.
    pub environment_facts: Value,
    /// Workspace components whose current model version is removed remotely.
    pub remotely_removed: Vec<String>,
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
    environment_reads: Vec<Value>,
    callbacks: callbacks::Callbacks,
}

impl CacheWrites {
    /// Tracking loads can acquire link issues before their generated packages exist.
    pub(in crate::commands) fn block_dependencies(
        &mut self,
        identities: &std::collections::HashSet<String>,
    ) {
        for entry in self.pending.iter_mut().chain(self.replacements.iter_mut()) {
            if identities.contains(base_identity(entry.identity())) {
                entry.block_cache();
            }
        }
    }

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
    /// A read-only aspect session initialized before the authoritative context snapshot.
    pub(in crate::commands) environments: Option<Environments>,
    /// Permit read-only consumers to capture soft-tagged and local-only components normally.
    pub allow_special_states: bool,
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
    fn validate_targets(&self, targets: &[Value]) -> io::Result<()> {
        if !self.missing_status_invalid
            && !self.allow_special_states
            && bitmap::has_special_state(targets)
        {
            return Err(decline("bitmap state requires the canonical workspace command"));
        }
        Ok(())
    }

    fn scan_behavior(&self) -> ScanBehavior {
        ScanBehavior {
            verify: self.verify,
            callbacks: self.missing_status_invalid || self.allow_special_states,
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
            .chain(self.cache.environment_reads.iter().cloned())
            .collect()
    }
}

/// Capture files and dependencies using the caller's read and cache policy.
pub fn capture_with(
    engine: &mut Engine,
    root: &Path,
    home: &Path,
    context: &Value,
    targets: &[Value],
    mut capture_options: CaptureOptions,
) -> io::Result<Capture> {
    let mut environments = capture_options.environments.take().unwrap_or_else(Environments::new);
    capture_environment(engine, root, home, context, targets, capture_options, &mut environments)
        .map_err(|error| environments.failure(error))
}

fn capture_environment(
    engine: &mut Engine,
    root: &Path,
    home: &Path,
    context: &Value,
    targets: &[Value],
    capture_options: CaptureOptions,
    environments: &mut Environments,
) -> io::Result<Capture> {
    capture_options.validate_targets(targets)?;
    let context = policy::pending_context(root, context)?;
    let snapshot = environments.is_snapshot();
    let checkout = environments.is_checkout();
    validate_write(root, &context, &capture_options, environments)?;
    let context = environments.context_for(root, &context, targets)?;
    let context = &context;
    let options: Options =
        serde_json::from_value(context["options"].clone()).map_err(io::Error::other)?;
    let inventory = Inventory::new(&options)?;
    let mut behavior = capture_options.scan_behavior();
    behavior.callbacks |= snapshot || checkout;
    let mut captured = initialize(root, context, !targets.is_empty(), capture_options)?;
    let mut facts = None;
    for target in targets {
        let scan = Scan {
            engine: &mut *engine,
            root,
            home,
            context,
            inventory: &inventory,
            facts: &mut facts,
            environments,
            behavior,
        };
        scan.target(target, &mut captured)?;
    }
    if snapshot {
        order::snapshot(root, &mut captured)?;
    }
    if environments.is_import() {
        commit::publish_import_dependencies(engine, root, &mut captured)?;
    }
    if behavior.callbacks {
        validate_documentation(engine, context)?;
        environments.callbacks(context, &mut captured, behavior.missing_status_invalid)?;
    }
    Ok(captured)
}

fn validate_documentation(engine: &mut Engine, context: &Value) -> io::Result<()> {
    engine.validate_read_set(
        context["documentationReadSet"]
            .as_array()
            .map_or(&[], Vec::as_slice),
        "documentation sources changed before callbacks",
    )
}

fn validate_write(
    root: &Path,
    context: &Value,
    options: &CaptureOptions,
    environments: &Environments,
) -> io::Result<()> {
    if !environments.is_snapshot()
        && !environments.is_checkout()
        && !options.missing_status_invalid
        && !options.allow_special_states
    {
        Environments::require_native_write(root, context)?;
    }
    Ok(())
}

fn initialize(
    root: &Path,
    context: &Value,
    has_targets: bool,
    capture_options: CaptureOptions,
) -> io::Result<Capture> {
    let no_fs_cache = cache::no_fs_cache(root);
    let reset = !no_fs_cache
        && !context["importCacheInitialized"].as_bool().unwrap_or(false)
        && has_targets
        && (capture_options.reset || needs_invalidation(root, &deps_dir(root))?);
    Ok(Capture {
        captured: Vec::new(),
        comparisons: Vec::new(),
        components: Vec::new(),
        environment_facts: {
            let mut facts = context["environmentFacts"].clone();
            facts["checkoutCacheMisses"] = json!({});
            facts
        },
        remotely_removed: Vec::new(),
        invalid: HashMap::new(),
        dependency_states: HashMap::new(),
        cache: CacheWrites {
            reset,
            no_fs_cache,
            versions: capture_options.cache_versions,
            environment_reads: context["environmentReadSet"]
                .as_array()
                .cloned()
                .unwrap_or_default(),
            ..CacheWrites::default()
        },
    })
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
    environments: &'s mut Environments,
}

#[derive(Clone, Copy)]
struct ScanBehavior {
    callbacks: bool,
    verify: bool,
    incomplete_reset: bool,
    missing_checkout_reset: bool,
    missing_status_invalid: bool,
}

impl Scan<'_> {
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
    let mut entry = json!({
        "identity": target["identity"],
        "version": version,
        "directory": directory,
        "files": files,
        "current": current,
    });
    if let Some(version) = target.get("trackingVersion") {
        entry["trackingVersion"] = version.clone();
    }
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
        ignored: policy.ignored_issues()?,
        identity: full_identity(target)?,
        package_name: policy.package_name.clone(),
        dependencies: dependency_identities(dependencies)?,
        issues: policy.issues(dependencies)?,
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
