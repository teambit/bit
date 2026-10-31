//! Retain configured providers and the installation host around authoritative import planning.
use super::{Planned, options::Options, render_with_progress};
use crate::commands::{
    add::ProjectedLinker, engine::Engine, installation::Installer, workspace_command,
};
use bit_install::{config::WorkspaceConfig, output::Output};
use serde_json::{Value, json};
use std::{ffi::OsString, io, path::Path, time::Instant};

pub(super) struct Lifecycle {
    linker: Option<ProjectedLinker>,
    workspace_order: Vec<String>,
    cache_owned: bool,
    json: bool,
}
impl Lifecycle {
    pub(super) fn required(root: &Path, options: &Options, preflight_ok: bool) -> io::Result<bool> {
        if options.operation != "import" {
            return Ok(false);
        }
        let config = WorkspaceConfig::load(root)?;
        if preflight_ok && options.needs_installer() {
            Installer::validate_workspace(root)?;
        }
        let core: Vec<String> = serde_json::from_str(include_str!(
            "../../../../../scopes/harmony/testing/load-aspect/core-aspects-ids.json"
        ))?;
        Ok((preflight_ok && options.requires_facts()) || root_providers(&config, &core))
    }
    pub(super) fn bootstrap(
        root: &Path,
        args: &[OsString],
        options: &Options,
        required: bool,
        preflight_ok: bool,
    ) -> io::Result<Self> {
        let linker = if !required {
            None
        } else if preflight_ok && options.needs_installer() {
            Some(ProjectedLinker::prepare_with_installation(root, args)?)
        } else {
            Some(ProjectedLinker::prepare(root)?)
        };
        Ok(Self {
            linker,
            workspace_order: Vec::new(),
            cache_owned: false,
            json: options.output.json,
        })
    }
    pub(super) const fn started(&self) -> bool {
        self.linker.is_some() || self.cache_owned
    }
    pub(super) fn own_cache(&mut self) {
        self.cache_owned = true;
    }
    pub(super) fn take_stdout(&mut self) -> String {
        let stdout = self.linker.as_mut().map_or_else(String::new, ProjectedLinker::take_stdout);
        if self.json { String::new() } else { stdout }
    }
    pub(super) fn before_apply(&self) -> io::Result<()> {
        self.linker
            .as_ref()
            .map_or(Ok(()), ProjectedLinker::validate_captures)
    }
    pub(super) fn acknowledge(&mut self, root: &Path, receipt: &Value) -> io::Result<()> {
        if receipt["applied"] == true {
            self.workspace_order = component_order(receipt)?;
        }
        if let Some(linker) = &mut self.linker {
            let writes = receipt
                .get("ownedWorkspaceWrites")
                .and_then(Value::as_array)
                .ok_or_else(|| io::Error::other("native import owned-write receipt"))?;
            linker.import_acknowledge(writes)?;
            if receipt["applied"] == true {
                linker.import_project_workspace(root)?;
                linker.call(
                    root,
                    "importWorkspaceOrder",
                    &json!({"ids":self.workspace_order,"defer":true}),
                )?;
            }
        }
        Ok(())
    }
    pub(super) fn capture_phase(&mut self, root: &Path, mode: &str) -> io::Result<Value> {
        let linker =
            self.linker.as_mut().ok_or_else(|| io::Error::other("import class session"))?;
        let bitmap = bit_object_import::parse_jsonc(&std::fs::read(root.join(".bitmap"))?)?;
        let context: Value = Engine::new()?.request(&json!({"kind":"trackingContext","root":root,"home":workspace_command::home(),"bitmap":bitmap}))?;
        let ids = context["targets"]
            .as_array()
            .ok_or_else(|| io::Error::other("import graph targets"))?
            .iter()
            .map(|row| {
                row["identity"]
                    .as_str()
                    .or_else(|| row["id"].as_str())
                    .map(str::trim)
                    .filter(|id| !id.is_empty())
                    .map(str::to_owned)
                    .ok_or_else(|| io::Error::other("import graph identity"))
            })
            .collect::<io::Result<Vec<_>>>()?;
        let ids = ordered_ids(&ids, &self.workspace_order)?;
        let mut rows = Vec::new();
        if mode == "graph" {
            // GraphIdsFromFsBuilder awaits each seed's get() before loading the next.
            for id in ids {
                rows.extend(capture_group(linker, root, &bitmap, &[id], mode, self.json)?);
            }
        } else {
            rows = capture_group(linker, root, &bitmap, &ids, mode, self.json)?;
        }
        linker.validate_captures()?;
        Ok(json!({"rows":rows,"readSet":linker.captured_read_set()}))
    }
    pub(super) fn dependency_facts(&mut self, root: &Path) -> io::Result<Value> {
        let captured = self.capture_phase(root, "writeDeps")?;
        let linker =
            self.linker.as_mut().ok_or_else(|| io::Error::other("import class session"))?;
        let facts = linker.call(root, "importWriteDependencyFacts", &json!({}))?;
        let stdout = linker.take_stdout();
        if !self.json {
            print!("{stdout}");
        }
        linker.validate_captures()?;
        Ok(json!({"facts":facts,"readSet":captured["readSet"]}))
    }
    pub(super) fn render(
        &mut self,
        root: &Path,
        planned: &mut Planned,
        options: &Options,
        output: &Output,
        started: Instant,
        progress_done: bool,
    ) -> io::Result<()> {
        if options.installs() {
            let linker = self.linker
                .as_mut()
                .ok_or_else(|| io::Error::other("import installation session"))?;
            if options.write.adoption.track_only {
                linker.import_docs(root, &planned.receipt.ids)?;
            }
            let order = component_order(&planned.prepared)?;
            linker.call(root, "importWorkspaceOrder", &json!({"ids":order}))?;
            let result = linker.with_installer(|installer| {
                render_with_progress(
                    planned,
                    options,
                    output,
                    started,
                    Some(installer),
                    root,
                    progress_done,
                )
            });
            let stdout = linker.take_stdout();
            if !options.output.json {
                print!("{stdout}");
            }
            result
        } else {
            render_with_progress(planned, options, output, started, None, root, progress_done)
        }
    }
}
fn root_providers(config: &WorkspaceConfig, core: &[String]) -> bool {
    config.aspects
        .keys()
        .any(|id| {
            let id = bit_install::config::aspect_id_without_version(id);
            id.contains('/')
                && !core.iter().any(|core| core == id)
                && !bit_install::policy::is_core_env(id)
        })
}

fn graph_dependencies(
    linker: &mut ProjectedLinker,
    root: &Path,
    rows: &mut [Value],
    json: bool,
) -> io::Result<()> {
    let facts = linker.call(root, "importGraphDependencyFacts", &json!({}))?;
    let stdout = linker.take_stdout();
    if !json {
        print!("{stdout}");
    }
    let facts = facts.as_array().ok_or_else(|| io::Error::other("import graph class facts"))?;
    if facts.len() != rows.len() {
        return Err(io::Error::other("import graph class count changed"));
    }
    for row in rows {
        let row_id = row["identity"]
            .as_str()
            .or_else(|| row["id"].as_str())
            .map(str::trim);
        let matches = facts
            .iter()
            .filter(|fact| {
                fact["identity"]
                    .as_str()
                    .or_else(|| fact["id"].as_str())
                    .map(str::trim)
                    == row_id
            })
            .collect::<Vec<_>>();
        if matches.len() != 1 || !matches[0]["resolvedDependencies"].is_array() {
            return Err(io::Error::other("import graph class identity changed"));
        }
        row["resolvedDependencies"] = matches[0]["resolvedDependencies"].clone();
    }
    Ok(())
}

fn capture_group(
    linker: &mut ProjectedLinker,
    root: &Path,
    bitmap: &Value,
    ids: &[String],
    mode: &str,
    json: bool,
) -> io::Result<Vec<Value>> {
    linker.call(root, "importClassLoad", &json!({"mode":mode,"ids":ids}))?;
    let captured = linker.capture_import(root, bitmap, ids, true);
    let completed = if captured.is_ok() {
        linker.call(root, "importCompleteClassLoad", &json!({}))
    } else {
        Ok(Value::Null)
    };
    let reset = linker.call(root, "importClassLoad", &json!({"mode":null}));
    let stdout = linker.take_stdout();
    if !json {
        print!("{stdout}");
    }
    let mut rows = captured?;
    completed?;
    reset?;
    if mode == "graph" {
        graph_dependencies(linker, root, &mut rows, json)?;
    }
    Ok(rows)
}

pub(super) fn component_order(receipt: &Value) -> io::Result<Vec<String>> {
    let Some(order) = receipt.get("workspaceComponentOrder") else { return Ok(Vec::new()) };
    let order = order.as_array().ok_or_else(|| io::Error::other("import workspace order"))?;
    let mut seen = std::collections::HashSet::new();
    order
        .iter()
        .map(|identity| {
            let identity = identity
                .as_str()
                .map(str::trim)
                .filter(|id| !id.is_empty())
                .ok_or_else(|| io::Error::other("import workspace order identity"))?;
            if !seen.insert(identity) {
                return Err(io::Error::other("duplicate import workspace identity"));
            }
            Ok(identity.to_owned())
        })
        .collect()
}
fn ordered_ids(ids: &[String], order: &[String]) -> io::Result<Vec<String>> {
    if order.is_empty() {
        return Ok(ids.to_vec());
    }
    let ordered = order
        .iter()
        .filter(|id| {
            ids.iter()
                .any(|candidate| candidate.trim() == id.trim())
        })
        .cloned()
        .collect::<Vec<_>>();
    if ordered.len() != ids.len() {
        return Err(io::Error::other("import workspace order incomplete"));
    }
    Ok(ordered)
}
