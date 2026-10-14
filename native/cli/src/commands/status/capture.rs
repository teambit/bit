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
use std::{io, path::Path};

pub struct Capture {
    /// Every selected target: identity, version, directory, files, current
    /// metadata and peer dependencies.
    pub captured: Vec<Value>,
    pub comparisons: Vec<Value>,
    pub components: Vec<Component>,
    /// Fresh detections whose cache entries are written on commit.
    pending: Vec<fresh::Pending>,
    /// `dependencyCacheNeedsInvalidation`: every nested component is detected
    /// afresh and the whole cache is replaced on commit.
    reset: bool,
}

impl Capture {
    /// `capture.dependencyReadSet`: the read sets of every fresh detection.
    pub fn dependency_read_set(&self) -> Vec<Value> {
        self.pending
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
    let options: Options =
        serde_json::from_value(context["options"].clone()).map_err(io::Error::other)?;
    let inventory = Inventory::new(&options)?;
    let reset = !targets.is_empty() && cache::needs_invalidation(root)?;
    let mut captured = Capture {
        captured: Vec::new(),
        comparisons: Vec::new(),
        components: Vec::new(),
        pending: Vec::new(),
        reset,
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
        let mut dependencies = if captured.reset && directory != "." {
            json!({ "needsDetection": true })
        } else {
            self.cached(target, directory, &files, &policy)?
        };
        if dependencies.get("needsDetection") == Some(&Value::Bool(true)) {
            let (detected, pending) = self.detect(target, &files, &policy)?;
            dependencies = detected;
            captured.pending.push(pending);
        }
        record(target, directory, &files, &policy, &dependencies, captured)
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
    if !capture.pending.is_empty() || capture.reset {
        fresh::commit(engine, root, &capture.pending, capture.reset)?;
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
