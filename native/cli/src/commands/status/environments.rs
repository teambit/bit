//! Environment callbacks supply policy and detector facts; Rust owns workspace sources.

pub(super) mod callbacks;
pub(super) mod diagnostics;

pub(in crate::commands) use context::{
    read_context, read_inherited_context, read_snapshot_context,
};
pub(in crate::commands) use quick::run as quick;

pub(in crate::commands) use callbacks::component_rows as hydration_rows;

mod builtin;
mod context;
mod dependencies;
mod facts;
mod modes;
mod quick;
mod snapshot;
mod switch;
mod tracking;

use super::js::{array, decline, text};
use crate::{
    discovery::{self, Target},
    host::Host,
};
use bit_install::{
    model::{ComponentId, WorkspaceComponent},
    policy::{EnvJsoncReader, scope::Scope},
};
use serde_json::{Value, json};
use std::{io, path::Path};

pub(in crate::commands) struct Environments {
    host: Option<Host>,
    issue_facts: bool,
    snapshot: bool,
    snapshot_build: bool,
    snapshot_loads: Vec<Value>,
    checkout: bool,
    import: Option<bool>,
    builtin_services: builtin::Services,
}
impl Environments {
    pub(super) fn new() -> Self {
        Self {
            host: None,
            issue_facts: true,
            snapshot: false,
            snapshot_build: false,
            snapshot_loads: Vec::new(),
            checkout: false,
            import: None,
            builtin_services: builtin::Services::Disabled,
        }
    }

    fn component_facts(
        &mut self,
        root: &Path,
        reader: &EnvJsoncReader<'_>,
        component: &WorkspaceComponent,
        core: &[String],
        aspects: &[String],
    ) -> io::Result<Value> {
        if self.builtin_services != builtin::Services::Disabled
            && builtin::supported(component, core, aspects)
        {
            return Ok(builtin::facts(component, self.issue_facts));
        }
        let needs_issues = self.issue_facts;
        facts::read(self.host(root)?, reader, component, core, aspects, needs_issues)
    }

    fn host(&mut self, root: &Path) -> io::Result<&Host> {
        if self.host.is_none() {
            let Target::Entry(cli) = discovery::find()? else {
                return Err(decline("environment needs installed Harmony"));
            };
            self.host = Some(Host::new(
                cli,
                root.to_owned(),
                crate::commands::color::Chalk::detect(&std::env::args_os().collect::<Vec<_>>())
                    .enabled(),
            ));
        }
        self.host.as_ref().ok_or_else(|| decline("environment host"))
    }

    /// Match `MergingMain`'s post-write application load in the retained session.
    pub(in crate::commands) fn merge_load_apps(
        &mut self,
        root: &Path,
        component_ids: &[String],
    ) -> io::Result<String> {
        let host = self.host(root)?;
        host.call("mergeLoadApps", &json!({"componentIds":component_ids}))?;
        Ok(host.take_stdout())
    }

    pub(in crate::commands) fn failure(&self, error: io::Error) -> io::Error {
        if !self.checkout
            || error
                .get_ref()
                .is_some_and(
                    <dyn std::error::Error + Send + Sync>::is::<
                        crate::host::callback_error::CallbackError,
                    >,
                )
        {
            return error;
        }
        match &self.host {
            Some(host) => crate::host::callback_error::CallbackError::wrap(
                error,
                host.take_stdout(),
                String::new(),
            ),
            None => error,
        }
    }

    pub(super) fn callbacks(
        &mut self,
        context: &Value,
        capture: &mut super::capture::Capture,
        status: bool,
    ) -> io::Result<()> {
        if let Some(host) = &self.host {
            if let Err(error) =
                callbacks::load(host, context, capture, status, self.snapshot, self.checkout)
            {
                if !self.checkout {
                    return Err(error);
                }
                return Err(crate::host::callback_error::CallbackError::wrap(
                    error,
                    super::capture::callback_startup_stdout(capture),
                    format!(
                        "{}{}",
                        super::capture::callback_load_stdout(capture),
                        host.take_stdout(),
                    ),
                ));
            }
            capture.cache.retain_callback_host(self.host.take());
        }
        Ok(())
    }

    pub(super) fn require_native_write(root: &Path, context: &Value) -> io::Result<()> {
        Self::require_native_write_for(
            root,
            context,
            array(context.get("targets"), "native write environments")?,
        )
    }

    pub(in crate::commands) fn require_native_write_for(
        root: &Path,
        context: &Value,
        targets: &[Value],
    ) -> io::Result<()> {
        let core = core_ids()?;
        let aspects = root_aspects(context, &core);
        for target in targets {
            if needs_facts(&component(root, context, target)?, &core, &aspects) {
                return Err(decline(
                    "write command environment callbacks require canonical lifecycle",
                ));
            }
        }
        Ok(())
    }

    pub(super) fn context_for(
        &mut self,
        root: &Path,
        context: &Value,
        targets: &[Value],
    ) -> io::Result<Value> {
        let mut enriched = context.clone();
        let components = array(context.get("targets"), "environment targets")?
            .iter()
            .map(|target| component(root, context, target))
            .collect::<io::Result<Vec<_>>>()?;
        let core = core_ids()?;
        let aspects = root_aspects(context, &core);
        let selected_components = components
            .iter()
            .filter(|component| selected(component, targets))
            .cloned()
            .collect::<Vec<_>>();
        self.prime(root, &selected_components, &core, &aspects)?;
        let reader = EnvJsoncReader {
            components: &components,
            scope: Scope::find(root).map(Scope::recording),
        };
        let mut proofs = context["environmentReadSet"]
            .as_array()
            .cloned()
            .unwrap_or_default();
        proofs.extend(local_proofs(&components)?);
        for component in &selected_components {
            if needs_facts(component, &core, &aspects) {
                let facts = self.component_facts(root, &reader, component, &core, &aspects)?;
                store_component_facts(&mut enriched, component, facts);
            }
        }
        if let Some(scope) = &reader.scope {
            proofs.extend(scope.read_set());
        }
        enriched["environmentFacts"]["snapshotEnvironmentLoads"] = json!(self.snapshot_loads);
        enriched["environmentReadSet"] = json!(proofs);
        enriched["importCacheInitialized"] = json!(self.import_cache_initialized());
        Ok(enriched)
    }
}

fn store_component_facts(enriched: &mut Value, component: &WorkspaceComponent, facts: Value) {
    if facts["loadFailures"]
        .as_array()
        .is_some_and(|arr| !arr.is_empty())
    {
        enriched["environmentFacts"]["loadFailures"] = facts["loadFailures"].clone();
    }
    enriched["environmentFacts"][component.id.to_string_without_version()] = facts;
}

fn component(root: &Path, context: &Value, target: &Value) -> io::Result<WorkspaceComponent> {
    let target = super::policy::environment_target(context, target)?;
    let config = target["config"]["extensions"]
        .as_object()
        .cloned()
        .unwrap_or_default();
    let env_id = crate::commands::update_cmd::aspect_entry(
        &target["config"]["extensions"],
        "teambit.envs/envs",
    )
    .and_then(|(_, cfg)| cfg["env"].as_str())
    .map_or_else(|| stored_env(context, &target), str::to_owned);
    let identity = text(target.get("identity"))?;
    let (scope, name) =
        identity.split_once('/').ok_or_else(|| decline("environment component identity"))?;
    let directory = text(target.get("directory"))?;
    Ok(WorkspaceComponent {
        id: ComponentId {
            scope: Some(scope.to_owned()),
            default_scope: None,
            name: name.to_owned(),
            version: target["version"].as_str().map(str::to_owned),
        },
        root_dir: directory.to_owned(),
        dir: root.join(directory),
        files: Vec::new(),
        main_file: target["mainFile"]
            .as_str()
            .unwrap_or_default()
            .to_owned(),
        package_name: String::new(),
        env_id,
        is_env: root
            .join(directory)
            .join("env.jsonc")
            .exists(),
        has_package_json: false,
        config,
    })
}

fn stored_env(context: &Value, target: &Value) -> String {
    stored_extensions(context, target)
        .and_then(|extensions| {
            extensions
                .iter()
                .find(|extension| extension["name"] == "teambit.envs/envs")
        })
        .and_then(|env| env["data"]["id"].as_str())
        .unwrap_or("teambit.harmony/node")
        .to_owned()
}

fn stored_extensions<'a>(context: &'a Value, target: &Value) -> Option<&'a Vec<Value>> {
    let identity = target["identity"].as_str().unwrap_or_default();
    let model = context["models"]
        .as_array()?
        .iter()
        .find(|model| {
            format!(
                "{}/{}",
                model["scope"].as_str().unwrap_or_default(),
                model["name"].as_str().unwrap_or_default(),
            ) == identity
        });
    let version = target["version"].as_str().unwrap_or_default();
    let hash = model
        .and_then(|model| model["versions"][version].as_str())
        .unwrap_or(version);
    context["versions"]
        .as_array()?
        .iter()
        .find(|row| row[0] == hash)
        .and_then(|row| row[1]["extensions"].as_array())
}

/// `DevFilesMain.computeDevPatterns` applied to the Rust inventory.
pub(super) fn dev_files(
    root: &Path,
    context: &Value,
    target: &Value,
    files: &[String],
) -> io::Result<Vec<String>> {
    use bit_install::dependencies::{DevPatternConfig, EnvDevPatterns, dev_files, dev_patterns};
    let mut component = component(root, context, target)?;
    component.files = files.to_vec();
    let facts = &context["environmentFacts"][text(target.get("identity"))?];
    component.env_id = facts["envId"]
        .as_str()
        .unwrap_or(&component.env_id)
        .to_owned();
    let hooks = &facts["devPatterns"];
    let list = |key: &str| {
        hooks
            .get(key)
            .filter(|value| !value.is_null())
            .map(strings)
    };
    let env = EnvDevPatterns {
        patterns: facts
            .get("manifestPatterns")
            .filter(|value| !value.is_null())
            .or_else(|| {
                hooks
                    .get("devPatterns")
                    .filter(|value| !value.is_null())
            })
            .cloned(),
        tests: list("tests"),
        docs: list("docs"),
        compositions: list("compositions"),
    };
    let config = DevPatternConfig::from_aspects(&|id| context["workspace"].get(id).cloned());
    Ok(dev_files(&component, &dev_patterns(&component, &config, &env)))
}

fn strings(value: &Value) -> Vec<String> {
    match value {
        Value::Array(values) => values
            .iter()
            .filter_map(Value::as_str)
            .map(str::to_owned)
            .collect(),
        Value::String(value) => vec![value.clone()],
        _ => Vec::new(),
    }
}

fn local_proofs(components: &[WorkspaceComponent]) -> io::Result<Vec<Value>> {
    components
        .iter()
        .flat_map(|component| [component.dir.join("env.jsonc"), component.dir.join("env.json")])
        .map(|path| bit_install::policy::scope::read_proof(&path))
        .collect()
}

fn root_aspects(context: &Value, core: &[String]) -> Vec<String> {
    context["workspace"]
        .as_object()
        .into_iter()
        .flat_map(|workspace| workspace.keys())
        .filter(|id| {
            id.contains('/') && !core.contains(id) && !bit_install::policy::is_core_env(id)
        })
        .cloned()
        .collect()
}

fn needs_facts(component: &WorkspaceComponent, core: &[String], aspects: &[String]) -> bool {
    component.is_env
        || component.env_id != "teambit.harmony/node"
        || !aspects.is_empty()
        || component.config
            .keys()
            .any(|id| {
                !core.contains(id)
                    || bit_install::policy::is_core_env(id) && id != "teambit.harmony/node"
            })
}

fn selected(component: &WorkspaceComponent, targets: &[Value]) -> bool {
    targets
        .iter()
        .any(|target| target["identity"] == component.id.to_string_without_version())
}

fn core_ids() -> io::Result<Vec<String>> {
    serde_json::from_str(include_str!(
        "../../../../../scopes/harmony/testing/load-aspect/core-aspects-ids.json"
    ))
    .map_err(io::Error::other)
}
