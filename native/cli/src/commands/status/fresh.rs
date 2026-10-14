//! Fresh dependency detection, for components whose dependency cache entry
//! is missing or stale: `readFreshDependencies` and `commitFreshDependencies`
//! of the Node.js glue (`rust-fresh-dependencies.ts`). The engine scans and
//! resolves; this module supplies what Node knew: the dev-file patterns, the
//! running Node's built-in modules, the bundled TypeScript version and the
//! core aspect packages.

mod dev_files;
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
/// `getAllCoreAspectsIds()`: the repository's list, which a Node.js spec
/// keeps equal to `manifests.ts`.
const CORE_ASPECT_IDS: &str =
    include_str!("../../../../../scopes/harmony/bit/core-aspect-ids.json");

/// A detection whose cache entry is written once the whole command succeeded.
pub struct Pending {
    identity: String,
    raw_data: String,
    cacheable: bool,
    read_set: Value,
}

/// Facts about the Node.js CLI that are the same for every component.
pub struct Facts {
    graph: Value,
    core_packages: Vec<String>,
}

impl Facts {
    pub fn new(home: &Path) -> io::Result<Self> {
        let node = node::Node::find()?;
        let graph = json!({
            "home": home,
            "builtins": node.builtins()?,
            "detectorExtensions": DETECTOR_EXTENSIONS,
            "typescript": node.typescript_version()?.as_deref() == Some(TYPESCRIPT),
        });
        let ids: Vec<String> = serde_json::from_str(CORE_ASPECT_IDS).map_err(io::Error::other)?;
        let core_packages = ids
            .iter()
            .map(|id| core_package_name(id))
            .collect();
        Ok(Self { graph, core_packages })
    }
}

/// `getCoreAspectPackageName`: `teambit.x/a/b` is `@teambit/a.b`.
fn core_package_name(id: &str) -> String {
    let name: Vec<&str> = id.split('/').skip(1).collect();
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
    pub fn read(
        &self,
        engine: &mut Engine,
        target: &Value,
        files: &[String],
        policy: &Policy,
    ) -> io::Result<(Value, Pending)> {
        let component_root = self.root.join(text(target.get("directory"))?);
        let capture: Value = engine.request(&json!({
            "kind": "dependencyDetectFresh",
            "root": self.root,
            "componentRoot": component_root,
            "identity": full_identity(target)?,
            "files": files.iter().map(|file| component_root.join(file)).collect::<Vec<_>>(),
            "detection": self.detection(files, policy)?,
        }))?;
        let mut receipt = capture
            .as_object()
            .cloned()
            .ok_or_else(|| decline("status capture"))?;
        let grammar_inputs = receipt.remove("grammarInputs").unwrap_or(Value::Null);
        let read_set = receipt
            .get("readSet")
            .cloned()
            .unwrap_or(Value::Null);
        let mut request = json!({ "kind": "dependencyPolicyDetected", "root": self.root,
            "componentRoot": component_root, "capture": receipt });
        super::spread(&mut request, &policy.input)?;
        request["resolution"]["grammar"] =
            grammar::dependency(&json!([policy.input, grammar_inputs]));
        let dependencies: Value = engine.request(&request)?;
        let raw_data = dependencies.get("rawData").and_then(Value::as_str);
        let cacheable = dependencies.get("cacheable").and_then(Value::as_bool);
        let (Some(raw_data), Some(cacheable), true) = (raw_data, cacheable, read_set.is_array())
        else {
            return Err(decline("status fresh dependency cache receipt"));
        };
        let pending = Pending {
            identity: full_identity(target)?,
            raw_data: raw_data.to_string(),
            cacheable,
            read_set,
        };
        Ok((dependencies, pending))
    }

    /// `freshDependencyDetection(context, files, policy)`.
    fn detection(&self, files: &[String], policy: &Policy) -> io::Result<Value> {
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
            "corePackages": self.facts.core_packages,
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
) -> io::Result<()> {
    for entry in pending {
        let validation: Value =
            engine.request(&json!({"kind": "dependencyFreshValidate", "readSet": entry.read_set}))?;
        if validation.get("fresh") != Some(&Value::Bool(true)) {
            return Err(decline("status fresh dependencies changed"));
        }
    }
    let cache = root
        .join(".bit")
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

#[cfg(test)]
mod fresh_tests;
