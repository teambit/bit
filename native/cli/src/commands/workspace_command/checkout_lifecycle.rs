//! Checkout provider startup and observable callback output, without Node VCS writes.

use crate::commands::{
    engine::Engine,
    status::{
        autosync::Startup,
        capture,
        environments::{self, Environments},
    },
};
use std::{
    io::{self, Write},
    path::Path,
};

pub(super) fn bootstrap(
    engine: &mut Engine,
    root: &Path,
    home: &Path,
    startup: Option<&mut Startup>,
    request: &super::Request<'_>,
    preview: bool,
) -> io::Result<Option<Environments>> {
    let Some(startup) = startup else {
        return Ok(None);
    };
    preflight(root, home, request, preview)?;
    let pattern = request.options["pattern"]
        .as_str()
        .map(str::trim)
        .filter(|pattern| {
            !pattern.is_empty() && !crate::commands::diff::selection::stateful(pattern)
        });
    let (_, environments) =
        environments::read_context(engine, root, home, false, pattern, startup)?;
    Ok(Some(environments.for_checkout()))
}

fn preflight(
    root: &Path,
    home: &Path,
    request: &super::Request<'_>,
    preview: bool,
) -> io::Result<()> {
    super::dependency_grammar()?;
    let mut probe = Engine::new()?;
    let context: serde_json::Value = probe.request(
        &serde_json::json!({"kind":"statusContext","root":root,"home":home,"history":false}),
    )?;
    let targets = super::array(context.get("targets"), "checkout eligibility targets")?;
    if Environments::require_native_write_for(root, &context, targets).is_err()
        && let Err(error) = super::prepare(&mut probe, root, home, request, preview)
        && !crate::commands::engine::is_canonical(&error)
    {
        return Err(error);
    }
    Ok(())
}

/// Reuse installation's process-fact Host without skipping autosync or providers.
pub(in crate::commands) fn bootstrap_inherited(
    root: &Path,
    request: &super::Request<'_>,
    startup: &mut Startup,
    inherited: Environments,
    preview: bool,
) -> io::Result<Environments> {
    let home = super::home();
    preflight(root, &home, request, preview)?;
    let mut engine = Engine::new()?;
    let pattern = request.options["pattern"]
        .as_str()
        .map(str::trim)
        .filter(|pattern| {
            !pattern.is_empty() && !crate::commands::diff::selection::stateful(pattern)
        });
    let (_, environment) = environments::read_inherited_context(
        &mut engine,
        root,
        &home,
        pattern,
        startup,
        inherited,
    )?;
    Ok(environment.for_checkout())
}

pub(in crate::commands) fn retain(startup: Option<&mut Startup>, capture: &capture::Capture) {
    if let Some(startup) = startup {
        startup.stdout.push_str(&capture::callback_startup_stdout(capture));
        startup.build_stdout.push_str(&capture::callback_load_stdout(capture));
    }
}

/// Provider output precedes `CommandRunner`; component onLoad output follows its status line.
pub(in crate::commands) fn before(startup: &Startup) -> io::Result<()> {
    io::stdout().write_all(startup.stdout.as_bytes())
}

pub(in crate::commands) fn loaded(startup: &Startup) {
    print!("{}", startup.build_stdout);
}

pub(in crate::commands) fn failure(
    root: &Path,
    args: &[std::ffi::OsString],
    command: &str,
    startup: &Startup,
    error: io::Error,
) -> io::Result<crate::native::Outcome> {
    before(startup)?;
    let callback = error
        .get_ref()
        .and_then(|error| error.downcast_ref::<crate::host::callback_error::CallbackError>());
    if let Some(callback) = callback {
        print!("{}", callback.startup);
    }
    let failed_output =
        callback.map_or_else(String::new, |callback| callback.output.clone());
    let progress = super::progress::Progress::parse(startup.build_progress.as_ref())?;
    super::execute_then(root, args, command, |output| {
        if command == "merge"
            && let Some(progress) = &progress
        {
            progress.render_merge(output);
        }
        if matches!(command, "checkout" | "revert")
            && let Some(progress) = progress
        {
            progress.render_checkout_with(output, false, command == "revert");
        }
        if matches!(command, "switch" | "import") {
            crate::commands::switch::render_failure_progress(output, startup, &failed_output)?;
        } else {
            loaded(startup);
            print!("{failed_output}");
        }
        Err(error)
    })
}
