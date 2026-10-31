//! Custom dependency detectors: an env's `getDepDetectors()`
//! (`calcComponentEnvDepDetectors`) and the detectors aspects register
//! (`registerDetector`, `DetectorHook`). Precinct asks them before its built-in
//! detectives, so a file one of them supports is detected by it alone.
//!
//! They are JavaScript, so the host runs them. It is asked only for a component
//! that can have one: no core env implements `getDepDetectors()`, and the
//! detectors Bit's core aspects register (env.jsonc, MDX) are replicated natively,
//! so a component of a core env is asked about only when the workspace configures
//! a non-core aspect, at its root or on the component (either may register a
//! detector). An env the host reports without detectors is not asked about again.

use super::scan;
use crate::{
    host::{CoreAspect, DetectRequest, Host},
    model::WorkspaceComponent,
    policy::{is_core_env, slots, split_version},
};
use indexmap::IndexMap;
use serde_json::Value;
use std::{collections::HashSet, io, path::PathBuf};

/// What a custom detector found in one file.
#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct CustomDetection {
    /// The specifiers, in detector order and without duplicates.
    pub specifiers: Vec<String>,
    /// A registered detector supports the file: relative imports resolve through
    /// `lookupTypeScript` whatever the file extension (`filing-cabinet`).
    pub typescript: bool,
    /// What a detector's `dependencyLookup` resolved each specifier to (an absolute
    /// path, `None` when it returned nothing). A specifier without an entry is
    /// resolved natively.
    pub lookups: IndexMap<String, Option<PathBuf>>,
}

/// Asks the host once per component, skipping envs known to have no detectors.
pub struct Detectors<'a> {
    host: &'a dyn Host,
    core_aspects: &'a [CoreAspect],
    /// The non-core aspects `workspace.jsonc` configures at its root.
    workspace_aspects: &'a [String],
    /// Whether the host was asked already, which loaded `workspace_aspects`.
    asked: bool,
    without: HashSet<String>,
}

impl<'a> Detectors<'a> {
    pub fn new(
        host: &'a dyn Host,
        core_aspects: &'a [CoreAspect],
        workspace_aspects: &'a [String],
    ) -> Self {
        Self { host, core_aspects, workspace_aspects, asked: false, without: HashSet::new() }
    }

    /// The files of `component` a custom detector supports, by component-relative path.
    pub async fn get(
        &mut self,
        component: &WorkspaceComponent,
    ) -> io::Result<IndexMap<String, CustomDetection>> {
        let env = split_version(&component.env_id).0.trim();
        // The workspace-root component is never detected.
        if component.root_dir == "."
            || env.is_empty()
            || component.files.is_empty()
            || self.without.contains(env)
            || !self.may_have_detectors(component)
        {
            return Ok(IndexMap::new());
        }
        let paths: Vec<String> = component.files
            .iter()
            .map(|file| {
                component.dir
                    .join(file)
                    .to_string_lossy()
                    .into_owned()
            })
            .collect();
        let request = DetectRequest {
            env_id: env,
            component_dir: component.dir.to_string_lossy().into_owned(),
            files: paths,
            aspect_ids: if self.asked { Vec::new() } else { self.workspace_aspects.to_vec() },
        };
        self.asked = true;
        let Some(found) = self.host.detect_dependencies(&request).await? else {
            self.without.insert(env.to_owned());
            return Ok(IndexMap::new());
        };
        Ok(component.files
            .iter()
            .zip(&request.files)
            .filter_map(|(file, path)| Some((file.clone(), parse(found.get(path)?))))
            .collect())
    }

    /// A non-core env, or a non-core aspect configured for the workspace or the
    /// component, may bring a detector.
    fn may_have_detectors(&self, component: &WorkspaceComponent) -> bool {
        !is_core_env(&component.env_id)
            || !self.workspace_aspects.is_empty()
            || slots::configures_non_core(component, self.core_aspects)
    }
}

/// `{ dependencies, typescript, lookups }`; `dependency-tree` reads an object's keys.
fn parse(entry: &Value) -> CustomDetection {
    let specifiers = match &entry["dependencies"] {
        Value::Array(items) => items
            .iter()
            .filter_map(specifier_str)
            .map(str::to_owned)
            .collect(),
        Value::Object(map) => map
            .keys()
            .map(|key| key.trim())
            .filter(|key| !key.is_empty())
            .map(str::to_owned)
            .collect(),
        _ => Vec::new(),
    };
    let lookups = entry["lookups"]
        .as_object()
        .into_iter()
        .flatten()
        .filter_map(|(specifier, path)| {
            let key = specifier.trim();
            if key.is_empty() {
                return None;
            }
            let resolved = path
                .as_str()
                .map(str::trim)
                .filter(|path| !path.is_empty())
                .map(PathBuf::from);
            Some((key.to_owned(), resolved))
        })
        .collect();
    let typescript = entry["typescript"]
        .as_bool()
        .unwrap_or_else(|| {
            entry["typescript"]
                .as_str()
                .is_some_and(|text| text.trim().eq_ignore_ascii_case("true"))
        });
    CustomDetection { specifiers: scan::dedupe(specifiers), typescript, lookups }
}

fn specifier_str(value: &Value) -> Option<&str> {
    non_empty_str(value)
        .or_else(|| value.get("specifier").and_then(non_empty_str))
        .or_else(|| value.get("packageName").and_then(non_empty_str))
        .or_else(|| value.get("id").and_then(non_empty_str))
        .or_else(|| value.get("name").and_then(non_empty_str))
}

fn non_empty_str(value: &Value) -> Option<&str> {
    value
        .as_str()
        .map(str::trim)
        .filter(|text| !text.is_empty())
}
