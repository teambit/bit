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
}

pub(super) fn capture(
    root: &Path,
    request: &Request<'_>,
    preview_snapshot: bool,
    mut startup: Option<&mut Startup>,
) -> io::Result<Prepared> {
    let mut reader = Reader::new(root, request, preview_snapshot, startup.as_deref_mut())?;
    if let Some(startup) = startup.as_deref_mut() {
        let mut progress = reader.context["commandProgress"].clone();
        progress["switchImportCount"] = reader.context["switchImportCount"].clone();
        startup.build_progress = Some(progress);
    }
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
    let capture = match captured {
        Some(capture) => capture,
        None => capture::capture_with(
            &mut reader.engine,
            root,
            &reader.home,
            &reader.context,
            &targets,
            options(request, reader.environments.take()),
        )?,
    };
    checkout_lifecycle::retain(startup, &capture);
    if matches!(request.operation, "checkout" | "switch") {
        capture::commit_checkout_dependencies(&mut reader.engine, root, &capture)?;
    }
    Ok(reader.finish(capture, selector_loads))
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
    fn new(
        root: &Path,
        request: &Request<'_>,
        preview: bool,
        startup: Option<&mut Startup>,
    ) -> io::Result<Self> {
        let home = home();
        let mut engine = Engine::new()?;
        let environments =
            checkout_lifecycle::bootstrap(&mut engine, root, &home, startup, request, preview)?;
        let (token, context, targets) =
            prepare_owned(&mut engine, root, &home, request, preview, environments.as_ref())?;
        Ok(Self { engine, home, token, context, targets, environments })
    }

    fn finish(self, capture: capture::Capture, selector_loads: Vec<usize>) -> Prepared {
        Prepared {
            engine: self.engine,
            home: self.home,
            token: self.token,
            context: self.context,
            capture,
            selector_loads,
        }
    }
}

fn options(
    request: &Request<'_>,
    environments: Option<crate::commands::status::environments::Environments>,
) -> capture::CaptureOptions {
    capture::CaptureOptions {
        verify: request.verify_fresh,
        missing_checkout_reset: request.operation == "checkout" && request.to == Some("reset"),
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
) -> io::Result<(String, Value, Vec<Value>)> {
    prepare(engine, root, home, request, preview)
        .map_err(|error| match environments {
            Some(environment) => environment.failure(error),
            None => error,
        })
}
