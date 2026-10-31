//! Retain pre-import documentation on main and dependency status caches on lanes.
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
    capture: Option<Capture>,
    docs: Vec<crate::commands::add::docs::CatDocs>,
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
    let targets = selected_targets(&context, ids)?;
    if targets.is_empty() {
        return Ok(None);
    }
    if context["currentLaneId"]
        .as_str()
        .map(str::trim)
        .filter(|lane| !lane.is_empty())
        .is_none_or(|lane| lane == "main" || lane.ends_with("/main"))
    {
        let docs = documentation(root, &targets)?;
        return Ok(Some(Prepared { engine, context, capture: None, docs }));
    }
    if !options.write.dependencies.fetch_deps {
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
    Ok(Some(Prepared { engine, context, capture: Some(capture), docs: Vec::new() }))
}

fn eligible(options: &Options, retained: bool) -> bool {
    let writing = options.operation == "import" && !options.objects_only;
    let without_install = options.write.skip_dependency_installation;
    let ordinary = !options.write.override_existing
        && options.write.merge_strategy.is_none()
        && !options.write.adoption.track_only;
    !retained && writing && without_install && ordinary
}

fn bare(raw: &str) -> &str {
    let trimmed = raw.trim();
    match trimmed.rsplit_once('@') {
        Some((prefix, _)) if !prefix.is_empty() => prefix.trim(),
        _ => trimmed,
    }
}

fn selected_targets(context: &Value, ids: &[String]) -> io::Result<Vec<Value>> {
    let requested: HashSet<&str> = ids
        .iter()
        .filter_map(|id| {
            let clean = bare(id);
            clean
                .split_once('/')
                .filter(|(scope, name)| !scope.trim().is_empty() && !name.trim().is_empty())
                .map(|_| clean)
        })
        .collect();
    let targets =
        context["targets"].as_array().ok_or_else(|| io::Error::other("import cache targets"))?;
    Ok(targets
        .iter()
        .filter(|row| {
            row["identity"]
                .as_str()
                .map(str::trim)
                .filter(|id| !id.is_empty())
                .or_else(|| {
                    row["id"]
                        .as_str()
                        .map(str::trim)
                        .filter(|id| !id.is_empty())
                })
                .is_some_and(|id| requested.contains(bare(id)))
        })
        .cloned()
        .collect())
}

impl Prepared {
    /// Once publication starts, caller retains ownership even if a write fails.
    pub(super) fn commit(mut self, root: &Path) -> io::Result<()> {
        for mut docs in self.docs {
            if !docs.misses().is_empty() {
                let crate::discovery::Target::Entry(cli) = crate::discovery::find()? else {
                    return Err(io::Error::other("import documentation parser unavailable"));
                };
                let host = crate::host::Host::new(cli, root.to_owned(), false);
                let receipt = host.call("catSemanticDocs", &json!({"components":docs.components(),"scopePath":bit_object_import::scope_path(root)}))?;
                print!("{}", host.take_stdout());
                if let Some(error) = docs.absorb(&receipt)? {
                    return Err(io::Error::other(error));
                }
            }
            docs.publish()?;
        }
        if let Some(capture) = &self.capture {
            capture::commit(&mut self.engine, root, &self.context, capture)?;
        }
        Ok(())
    }
}

fn bitmap(root: &Path) -> io::Result<Value> {
    bit_object_import::parse_jsonc(&std::fs::read(root.join(".bitmap"))?)
}

fn documentation(
    root: &Path,
    targets: &[Value],
) -> io::Result<Vec<crate::commands::add::docs::CatDocs>> {
    let identities = targets
        .iter()
        .map(|target| {
            target["identity"]
                .as_str()
                .map(str::trim)
                .filter(|id| !id.is_empty())
                .or_else(|| {
                    target["id"]
                        .as_str()
                        .map(str::trim)
                        .filter(|id| !id.is_empty())
                })
                .map(str::to_owned)
                .ok_or_else(|| io::Error::other("import documentation identity"))
        })
        .collect::<io::Result<Vec<_>>>()?;
    let components =
        crate::commands::add::ProjectedLinker::import_documentation_components(root, &identities)?;
    components
        .into_iter()
        .map(|component| {
            crate::commands::add::docs::cat_prepare(root, component)
                .ok_or_else(|| {
                    io::Error::other("import current documentation requires canonical cache")
                })
        })
        .collect()
}
