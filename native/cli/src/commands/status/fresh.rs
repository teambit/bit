//! Fresh dependency detection, for components whose dependency cache entry
//! is missing or stale, and the commit of their cache entries. The engine scans and
//! resolves; this module supplies what Node knew: the dev-file patterns, the
//! running Node's built-in modules, the bundled TypeScript version and the
//! core aspect packages.

pub mod dev_files;
#[cfg(test)]
mod fresh_tests;
mod node;

use super::{
    grammar,
    js::{array, decline, full_identity, text},
    policy::Policy,
};
use crate::commands::engine::Engine;
use serde_json::{Value, json};
use std::{io, path::Path};

/// `rustGraphDetectorExtensions` plus `.jsonc`.
const DETECTOR_EXTENSIONS: [&str; 16] = [
    ".js", ".jsx", ".cjs", ".mjs", ".css", ".sass", ".less", ".scss", ".styl", ".mts", ".cts",
    ".ts", ".tsx", ".md", ".mdx", ".jsonc",
];
/// The TypeScript version the engine's import resolution reproduces.
const TYPESCRIPT: &str = "5.9.2";
/// `getAllCoreAspectsIds()`: the list `npm run generate-core-aspects-ids`
/// writes for `load-aspect` (`bit aspect list-core --json`).
const CORE_ASPECT_IDS: &str =
    include_str!("../../../../../scopes/harmony/testing/load-aspect/core-aspects-ids.json");

/// A detection whose cache entry is written once the whole command succeeded.
#[derive(Clone)]
pub struct Pending {
    identity: String,
    raw_data: String,
    cacheable: bool,
    read_set: Value,
}

impl Pending {
    /// A `dependencyCaches` entry of the engine.
    pub fn from_cache(cache: &Value) -> io::Result<Self> {
        let raw_data = cache.get("rawData").and_then(Value::as_str);
        let cacheable = cache.get("cacheable").and_then(Value::as_bool);
        let read_set = cache.get("readSet").filter(|read_set| read_set.is_array());
        let (Some(raw_data), Some(cacheable), Some(read_set)) = (raw_data, cacheable, read_set)
        else {
            return Err(decline("command dependency cache receipt"));
        };
        let identity = text(cache.get("identity"))?.trim().to_string();
        if identity.is_empty() {
            return Err(decline("command dependency cache identity"));
        }
        Ok(Self { identity, raw_data: raw_data.to_string(), cacheable, read_set: read_set.clone() })
    }

    fn detected(target: &Value, dependencies: &Value, read_set: Value) -> io::Result<Self> {
        let raw_data = dependencies.get("rawData").and_then(Value::as_str);
        let cacheable = dependencies.get("cacheable").and_then(Value::as_bool);
        let (Some(raw_data), Some(cacheable), true) = (raw_data, cacheable, read_set.is_array())
        else {
            return Err(decline("status fresh dependency cache receipt"));
        };
        Ok(Self {
            identity: full_identity(target)?,
            raw_data: raw_data.to_string(),
            cacheable,
            read_set,
        })
    }

    /// Keep source receipts validated while suppressing a cache-blocked detection write.
    pub(in crate::commands) fn block_cache(&mut self) {
        self.cacheable = false;
    }

    /// The same entry under another identity.
    pub fn renamed(&self, identity: String) -> Self {
        Self { identity, ..self.clone() }
    }

    /// `<id>@<version>`.
    pub fn identity(&self) -> &str {
        &self.identity
    }

    pub(in crate::commands::status) fn replace_source_proof(
        &mut self,
        before: &Value,
        after: &Value,
    ) {
        if let Some(proofs) = self.read_set.as_array_mut() {
            for proof in proofs {
                if proof == before {
                    *proof = after.clone();
                }
            }
        }
    }

    /// The files the detection read, which the engine checks again before writing.
    pub fn read_set(&self) -> &[Value] {
        self.read_set
            .as_array()
            .map_or(&[], Vec::as_slice)
    }
}

/// Facts about the Node.js CLI that are the same for every component.
pub struct Facts {
    graph: Value,
    core_packages: Vec<String>,
    core_aspect_ids: Vec<String>,
}

impl Facts {
    pub fn new(home: &Path) -> io::Result<Self> {
        let mut graph = dependency_grammar()?;
        graph["home"] = json!(home);
        let ids: Vec<String> = serde_json::from_str(CORE_ASPECT_IDS).map_err(io::Error::other)?;
        let core_packages = ids
            .iter()
            .map(|id| core_package_name(id))
            .collect();
        Ok(Self { graph, core_packages, core_aspect_ids: ids })
    }
}

/// `nativeDependencyGrammar()`: the running Node's built-in modules, the
/// detector extensions and whether the bundled TypeScript is the one the
/// engine reproduces.
pub fn dependency_grammar() -> io::Result<Value> {
    let node = node::Node::find()?;
    Ok(json!({
        "builtins": node.builtins()?,
        "detectorExtensions": DETECTOR_EXTENSIONS,
        "typescript": node.typescript_version()?.as_deref() == Some(TYPESCRIPT),
    }))
}

/// `getCoreAspectPackageName`: `teambit.x/a/b` is `@teambit/a.b`.
fn core_package_name(id: &str) -> String {
    let name: Vec<&str> = id
        .trim()
        .split('/')
        .skip(1)
        .map(str::trim)
        .filter(|part| !part.is_empty())
        .collect();
    format!("@teambit/{}", name.join("."))
}

/// What one fresh detection needs beyond the target and its files.
pub struct Detection<'d> {
    pub root: &'d Path,
    pub context: &'d Value,
    pub facts: &'d Facts,
}

impl Detection<'_> {
    /// `readFreshDependencies`: the dependency state and the pending cache entry.
    pub fn read_with_detectors(
        &self,
        engine: &mut Engine,
        target: &Value,
        files: &[String],
        policy: &Policy,
        custom: Value,
    ) -> io::Result<(Value, Pending)> {
        let component_root = self.root.join(text(target.get("directory"))?);
        let mut detection = self.detection(files, policy)?;
        detection["graph"]["custom"] = custom;
        detection["devFiles"] =
            json!(super::environments::dev_files(self.root, self.context, target, files)?);
        let capture: Value = engine.request(&json!({
            "kind": "dependencyDetectFresh",
            "root": self.root,
            "componentRoot": component_root,
            "identity": full_identity(target)?,
            "files": files.iter().map(|file| component_root.join(file)).collect::<Vec<_>>(),
            "detection": detection,
        }))?;
        let (receipt, grammar_inputs, read_set) = self.receipt(&capture)?;
        let mut request = json!({ "kind": "dependencyPolicyDetected", "root": self.root,
            "componentRoot": component_root, "capture": receipt });
        super::capture::spread(&mut request, &policy.input)?;
        request["resolution"]["grammar"] =
            grammar::dependency(&json!([policy.input, grammar_inputs]));
        let dependencies: Value = engine.request(&request)?;
        let pending = Pending::detected(target, &dependencies, read_set)?;
        Ok((dependencies, pending))
    }

    fn receipt(&self, capture: &Value) -> io::Result<(Value, Value, Value)> {
        let mut receipt = capture
            .as_object()
            .cloned()
            .ok_or_else(|| decline("status capture"))?;
        let grammar_inputs = receipt.remove("grammarInputs").unwrap_or(Value::Null);
        if let Some(proofs) = self.context["environmentReadSet"].as_array() {
            receipt
                .get_mut("readSet")
                .and_then(Value::as_array_mut)
                .ok_or_else(|| decline("environment proof receipt"))?
                .extend(proofs.iter().cloned());
        }
        let read_set = receipt
            .get("readSet")
            .cloned()
            .unwrap_or(Value::Null);
        Ok((Value::Object(receipt), grammar_inputs, read_set))
    }

    /// `freshDependencyDetection(context, files, policy)`.
    pub fn detection(&self, files: &[String], policy: &Policy) -> io::Result<Value> {
        let workspace = &policy.input["policies"]["workspacePolicy"];
        let field = |name: &str| {
            workspace
                .get(name)
                .cloned()
                .unwrap_or_else(|| json!({}))
        };
        let components = array(self.context.get("targets"), "targets")?
            .iter()
            .map(full_identity)
            .collect::<io::Result<Vec<_>>>()?;
        Ok(json!({
            "graph": self.facts.graph,
            "devFiles": files.iter().filter(|file| dev_files::is_dev_file(file)).collect::<Vec<_>>(),
            "modelPackages": policy.model_packages,
            "workspacePolicy": [field("dependencies"), field("devDependencies"), field("peerDependencies")],
            "mergePolicy": policy.input["resolution"]["merge"],
            "corePackages": self.facts.core_packages,
            "coreAspectIds": self.facts.core_aspect_ids,
            "workspaceComponents": components,
        }))
    }
}

/// `commitFreshDependencies`: every read set still fresh, then the entries saved.
pub fn commit(
    engine: &mut Engine,
    root: &Path,
    pending: &[Pending],
    reset: bool,
    write_cache: bool,
) -> io::Result<()> {
    let proofs = pending
        .iter()
        .flat_map(Pending::read_set)
        .cloned()
        .collect::<Vec<_>>();
    engine.validate_read_set(&proofs, "status fresh dependencies changed")?;
    if !write_cache {
        return Ok(());
    }
    let cache = bit_object_import::scope_path(root)
        .join("cache")
        .join("components")
        .join("deps");
    // `deleteAllDependenciesDataCache`: the deps cache holds nothing else.
    if reset {
        match std::fs::remove_dir_all(&cache) {
            Err(error) if error.kind() != io::ErrorKind::NotFound => return Err(error),
            _ => {}
        }
    }
    for entry in pending.iter().filter(|entry| entry.cacheable) {
        bit_install::dependencies::cache::put(&cache, &entry.identity, &entry.raw_data)?;
    }
    Ok(())
}
