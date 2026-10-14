//! Custom dependency detectors: an env's `getDepDetectors()`
//! (`calcComponentEnvDepDetectors`) and the detectors aspects register
//! (`registerDetector`, `DetectorHook`). Precinct asks them before its built-in
//! detectives, so a file one of them supports is detected by it alone.
//!
//! They are JavaScript, so the host runs them. It is asked only for a component
//! that can have one: no core env implements `getDepDetectors()`, and the
//! detectors Bit's core aspects register (env.jsonc, MDX) are replicated natively,
//! so a component of a core env is asked about only when it configures a
//! non-core aspect (which may register a detector). An env the host reports
//! without detectors is not asked about again.

use super::scan;
use crate::{
    host::{CoreAspect, Host},
    model::WorkspaceComponent,
    policy::{is_core_env, slots, split_version},
};
use indexmap::IndexMap;
use serde_json::Value;
use std::{collections::HashSet, io};

/// What a custom detector found in one file.
#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct CustomDetection {
    /// The specifiers, in detector order and without duplicates.
    pub specifiers: Vec<String>,
    /// A registered detector: relative imports resolve through `lookupTypeScript`
    /// whatever the file extension (`filing-cabinet`).
    pub typescript: bool,
}

/// Asks the host once per component, skipping envs known to have no detectors.
pub struct Detectors<'a> {
    host: &'a dyn Host,
    core_aspects: &'a [CoreAspect],
    without: HashSet<String>,
}

impl<'a> Detectors<'a> {
    pub fn new(host: &'a dyn Host, core_aspects: &'a [CoreAspect]) -> Self {
        Self { host, core_aspects, without: HashSet::new() }
    }

    /// The files of `component` a custom detector supports, by component-relative path.
    pub async fn get(
        &mut self,
        component: &WorkspaceComponent,
    ) -> io::Result<IndexMap<String, CustomDetection>> {
        let env = split_version(&component.env_id).0;
        // The workspace-root component is never detected.
        if component.root_dir == "."
            || component.files.is_empty()
            || self.without.contains(env)
            || !may_have_detectors(component, self.core_aspects)
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
        let Some(found) = self.host.detect_dependencies(env, &paths).await? else {
            self.without.insert(env.to_owned());
            return Ok(IndexMap::new());
        };
        Ok(component.files
            .iter()
            .zip(&paths)
            .filter_map(|(file, path)| Some((file.clone(), parse(found.get(path)?))))
            .collect())
    }
}

/// A non-core env, or a configured non-core aspect, may bring a detector.
fn may_have_detectors(component: &WorkspaceComponent, core_aspects: &[CoreAspect]) -> bool {
    !is_core_env(&component.env_id) || slots::configures_non_core(component, core_aspects)
}

/// `{ dependencies, typescript }`; `dependency-tree` reads an object's keys.
fn parse(entry: &Value) -> CustomDetection {
    let specifiers = match &entry["dependencies"] {
        Value::Array(items) => items
            .iter()
            .filter_map(Value::as_str)
            .filter(|specifier| !specifier.is_empty())
            .map(str::to_owned)
            .collect(),
        Value::Object(map) => map.keys().cloned().collect(),
        _ => Vec::new(),
    };
    CustomDetection {
        specifiers: scan::dedupe(specifiers),
        typescript: entry["typescript"].as_bool().unwrap_or(false),
    }
}
