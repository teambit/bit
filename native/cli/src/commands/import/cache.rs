//! `getManyComponentsStatuses` primes the current lane's dependency cache before import.
use super::options::Options;
use crate::commands::{
    engine::Engine,
    status::capture::{self, Capture, CaptureOptions},
    workspace_command,
};
use serde_json::{Value, json};
use std::{collections::HashSet, io, path::Path};

pub(super) struct Prepared {
    engine: Engine,
    context: Value,
    capture: Capture,
}

/// Stage the published pre-import status load without filesystem publication.
pub(super) fn prepare(
    root: &Path,
    options: &Options,
    ids: &[String],
    retained: bool,
) -> io::Result<Option<Prepared>> {
    if !eligible(options, retained) {
        return Ok(None);
    }
    let mut engine = Engine::new()?;
    let home = workspace_command::home();
    let mut context: Value = engine.request(
        &json!({"kind":"trackingContext","root":root,"home":home,"bitmap":bitmap(root)?}),
    )?;
    if context["currentLaneId"].is_null() {
        return Ok(None);
    }
    let targets = selected_targets(&context, ids)?;
    if targets.is_empty() {
        return Ok(None);
    }
    context["pendingHistory"] = json!([]);
    let capture = capture::capture_with(
        &mut engine,
        root,
        &home,
        &context,
        &targets,
        CaptureOptions::default(),
    )?;
    Ok(Some(Prepared { engine, context, capture }))
}

fn eligible(options: &Options, retained: bool) -> bool {
    let writing = options.operation == "import" && !options.objects_only;
    let fetch_deps =
        options.write.skip_dependency_installation && options.write.dependencies.fetch_deps;
    let ordinary = !options.write.override_existing
        && options.write.merge_strategy.is_none()
        && !options.write.adoption.track_only;
    !retained && writing && fetch_deps && ordinary
}

fn selected_targets(context: &Value, ids: &[String]) -> io::Result<Vec<Value>> {
    let requested: HashSet<&str> = ids
        .iter()
        .filter_map(|id| {
            id.split_once('/')
                .map(|_| id.split('@').next().unwrap_or(id))
        })
        .collect();
    let targets =
        context["targets"].as_array().ok_or_else(|| io::Error::other("import cache targets"))?;
    Ok(targets
        .iter()
        .filter(|row| {
            row["identity"]
                .as_str()
                .is_some_and(|id| requested.contains(id))
        })
        .cloned()
        .collect())
}

impl Prepared {
    /// Once publication starts, caller retains ownership even if a write fails.
    pub(super) fn commit(mut self, root: &Path) -> io::Result<()> {
        capture::commit(&mut self.engine, root, &self.context, &self.capture)
    }
}

fn bitmap(root: &Path) -> io::Result<Value> {
    bit_object_import::parse_jsonc(&std::fs::read(root.join(".bitmap"))?)
}
