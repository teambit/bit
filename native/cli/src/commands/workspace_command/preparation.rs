//! Native context, selection and source capture before checkout planning.
use super::{Engine, Request, capture, checkout_lifecycle, checkout_selection, home, prepare};
use crate::commands::status::autosync::Startup;
use serde_json::Value;
use std::{
    io,
    path::{Path, PathBuf},
};

pub(super) struct Prepared {
    pub engine: Engine,
    pub home: PathBuf,
    pub token: String,
    pub context: Value,
    pub capture: capture::Capture,
    pub selector_loads: Vec<usize>,
    pub docs: Option<crate::commands::add::PreparedDocs>,
}

pub(super) fn capture(
    root: &Path,
    request: &Request<'_>,
    preview_snapshot: bool,
    mut startup: Option<&mut Startup>,
    inherited: Option<crate::commands::status::environments::Environments>,
) -> io::Result<Prepared> {
    let reader = Reader::start(
        root,
        request,
        preview_snapshot,
        startup.as_deref_mut(),
        inherited,
        Engine::new()?,
    )?;
    capture_reader(root, request, startup, reader)
}

pub(super) fn capture_retained(
    root: &Path,
    request: &Request<'_>,
    mut startup: Option<&mut Startup>,
    inherited: Option<crate::commands::status::environments::Environments>,
    engine: Engine,
) -> io::Result<Prepared> {
    let reader = Reader::start(root, request, false, startup.as_deref_mut(), inherited, engine)?;
    capture_reader(root, request, startup, reader)
}

fn capture_reader(
    root: &Path,
    request: &Request<'_>,
    mut startup: Option<&mut Startup>,
    mut reader: Reader,
) -> io::Result<Prepared> {
    let (targets, selector_loads, captured) = checkout_selection::select(
        &mut reader.engine,
        root,
        &reader.home,
        request,
        checkout_selection::Prepared {
            token: &reader.token,
            context: &reader.context,
            targets: &reader.targets,
            environments: &mut reader.environments,
            startup: startup.as_deref_mut(),
        },
    )?;
    let mut docs = reader.documentation(root, request, &targets, startup.as_deref_mut())?;
    let mut capture = owned_result(
        reader.load(root, request, &targets, captured),
        &mut docs,
        startup.as_deref_mut(),
    )?;
    checkout_lifecycle::retain(startup.as_deref_mut(), &capture);
    reader.commit_dependencies(
        root,
        request,
        &mut capture,
        startup.as_ref().is_some_and(|startup| startup.committed),
    )?;
    Ok(reader.finish(capture, selector_loads, docs))
}

fn load_docs(
    root: &Path,
    request: &Request<'_>,
    targets: &[Value],
    environment: Option<&mut crate::commands::status::environments::Environments>,
    startup: Option<&mut Startup>,
) -> io::Result<Option<crate::commands::add::PreparedDocs>> {
    if !matches!(request.operation, "checkout" | "switch") {
        return Ok(None);
    }
    let Some(environment) = environment else {
        return Ok(None);
    };
    let identities = targets
        .iter()
        .filter(|target| {
            target["directory"]
                .as_str()
                .map(str::trim)
                .is_some_and(|directory| !directory.is_empty() && root.join(directory).is_dir())
        })
        .map(|target| super::text(target.get("identity")).map(|id| id.trim().to_owned()))
        .collect::<io::Result<Vec<_>>>()?;
    if identities.is_empty() {
        return Ok(None);
    }
    let deferred =
        request.operation != "switch" && !startup.as_ref().is_some_and(|startup| startup.committed);
    if let Some(startup) = startup {
        startup.stdout.push_str(&environment.take_tracking_stdout());
        startup.committed |= !deferred;
    }
    let docs = crate::commands::add::ProjectedLinker::prepare_checkout_docs(
        root,
        environment,
        &identities,
        deferred,
    )
    .map_err(|error| environment.failure(error))?;
    if deferred {
        Ok(Some(docs))
    } else {
        docs.publish()?;
        Ok(None)
    }
}

pub(super) fn publish_on_failure(
    docs: Option<crate::commands::add::PreparedDocs>,
    startup: Option<&mut Startup>,
    error: &io::Error,
) -> io::Result<()> {
    if startup.as_ref().is_some_and(|startup| startup.committed)
        || crate::commands::engine::is_canonical(error)
    {
        publish_docs(docs, startup)?;
    }
    Ok(())
}

pub(super) fn publish_docs(
    docs: Option<crate::commands::add::PreparedDocs>,
    startup: Option<&mut Startup>,
) -> io::Result<()> {
    if let Some(docs) = docs {
        if let Some(startup) = startup {
            startup.committed = true;
        }
        docs.publish()?;
    }
    Ok(())
}

pub(super) fn owned_result<Output>(
    result: io::Result<Output>,
    docs: &mut Option<crate::commands::add::PreparedDocs>,
    startup: Option<&mut Startup>,
) -> io::Result<Output> {
    match result {
        Ok(value) => Ok(value),
        Err(error) => {
            publish_on_failure(docs.take(), startup, &error)?;
            Err(error)
        }
    }
}

struct Reader {
    engine: Engine,
    home: PathBuf,
    token: String,
    context: Value,
    targets: Vec<Value>,
    environments: Option<crate::commands::status::environments::Environments>,
}

impl Reader {
    fn documentation(
        &mut self,
        root: &Path,
        request: &Request<'_>,
        targets: &[Value],
        startup: Option<&mut Startup>,
    ) -> io::Result<Option<crate::commands::add::PreparedDocs>> {
        let docs = load_docs(root, request, targets, self.environments.as_mut(), startup)?;
        if let Some(docs) = &docs {
            self.context["documentationReadSet"] = serde_json::json!(docs.source_proofs());
        }
        Ok(docs)
    }

    fn commit_dependencies(
        &mut self,
        root: &Path,
        request: &Request<'_>,
        capture: &mut capture::Capture,
        owned: bool,
    ) -> io::Result<()> {
        if matches!(request.operation, "checkout" | "switch") {
            crate::commands::add::restrict_dependency_cache(root, capture);
            if request.operation == "switch" || owned {
                capture::commit_checkout_dependencies(&mut self.engine, root, capture)?;
            }
        }
        Ok(())
    }

    fn load(
        &mut self,
        root: &Path,
        request: &Request<'_>,
        targets: &[Value],
        captured: Option<capture::Capture>,
    ) -> io::Result<capture::Capture> {
        match captured {
            Some(capture) => Ok(capture),
            None => capture::capture_with(
                &mut self.engine,
                root,
                &self.home,
                &self.context,
                targets,
                options(request, self.environments.take()),
            ),
        }
    }

    fn start(
        root: &Path,
        request: &Request<'_>,
        preview: bool,
        mut startup: Option<&mut Startup>,
        inherited: Option<crate::commands::status::environments::Environments>,
        engine: Engine,
    ) -> io::Result<Self> {
        let reader = Self::new(root, request, preview, startup.as_deref_mut(), inherited, engine)
            .inspect_err(|error| {
                if let Some(progress) = crate::commands::engine::canonical_progress(error)
                    && let Some(startup) = startup.as_deref_mut()
                {
                    startup.build_progress = Some(progress.clone());
                }
            })?;
        if let Some(startup) = startup {
            let mut progress = reader.context["commandProgress"].clone();
            progress["switchImportCount"] = reader.context["switchImportCount"].clone();
            progress["switchRemoteWarning"] = reader.context["switchRemoteWarning"].clone();
            startup.build_progress = Some(progress);
        }
        Ok(reader)
    }

    fn new(
        root: &Path,
        request: &Request<'_>,
        preview: bool,
        mut startup: Option<&mut Startup>,
        inherited: Option<crate::commands::status::environments::Environments>,
        mut engine: Engine,
    ) -> io::Result<Self> {
        let home = home();
        let environments = match inherited {
            Some(environment) => Some(environment.for_checkout()),
            None => checkout_lifecycle::bootstrap(
                &mut engine,
                root,
                &home,
                startup.as_deref_mut(),
                request,
                preview,
            )?,
        }
        .map(|environment| {
            if request.operation == "switch" {
                environment.with_issue_facts(false)
            } else {
                environment
            }
        });
        let (token, context, targets) = prepare_owned(
            &mut engine,
            root,
            &home,
            request,
            preview,
            environments.as_ref(),
            startup,
        )?;
        Ok(Self { engine, home, token, context, targets, environments })
    }

    fn finish(
        self,
        capture: capture::Capture,
        selector_loads: Vec<usize>,
        docs: Option<crate::commands::add::PreparedDocs>,
    ) -> Prepared {
        Prepared {
            engine: self.engine,
            home: self.home,
            token: self.token,
            context: self.context,
            capture,
            selector_loads,
            docs,
        }
    }
}

fn options(
    request: &Request<'_>,
    environments: Option<crate::commands::status::environments::Environments>,
) -> capture::CaptureOptions {
    capture::CaptureOptions {
        verify: request.verify_fresh,
        missing_checkout_reset: request.operation == "checkout"
            && request.to.map(str::trim) == Some("reset"),
        environments,
        ..Default::default()
    }
}

fn prepare_owned(
    engine: &mut Engine,
    root: &Path,
    home: &Path,
    request: &Request<'_>,
    preview: bool,
    environments: Option<&crate::commands::status::environments::Environments>,
    startup: Option<&mut Startup>,
) -> io::Result<(String, Value, Vec<Value>)> {
    prepare(engine, root, home, request, preview)
        .map_err(|error| {
            if let Some(progress) = crate::commands::engine::canonical_progress(&error)
                && let Some(startup) = startup
            {
                startup.build_progress = Some(progress.clone());
            }
            match environments {
                Some(environment) => environment.failure(error),
                None => error,
            }
        })
}
