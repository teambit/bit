//! Checkout provider startup and observable callback output, without Node VCS writes.
//!
//! [`bootstrap`] coordinates [`Engine`], [`Startup`] autosync, [`capture`], and [`Environments`] during checkout.

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
    let pattern = non_stateful_pattern(request);
    let (_, environments) =
        environments::read_context(engine, root, home, false, pattern, startup)?;
    Ok(Some(environments.for_checkout()))
}

#[inline]
fn non_stateful_pattern<'a>(request: &'a super::Request<'_>) -> Option<&'a str> {
    request.options["pattern"]
        .as_str()
        .map(str::trim)
        .filter(|pattern| {
            !pattern.is_empty() && !crate::commands::diff::selection::stateful(pattern)
        })
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
    let pattern = non_stateful_pattern(request);
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

#[inline]
pub(in crate::commands) fn retain(startup: Option<&mut Startup>, capture: &capture::Capture) {
    if let Some(startup) = startup {
        startup.stdout.push_str(&capture::callback_startup_stdout(capture));
        startup.build_stdout.push_str(&capture::callback_load_stdout(capture));
    }
}

/// Provider output precedes `CommandRunner`; component onLoad output follows its status line.
#[inline]
pub(in crate::commands) fn before(startup: &Startup) -> io::Result<()> {
    if startup.stdout.is_empty() {
        return Ok(());
    }
    let mut stdout = io::stdout().lock();
    stdout.write_all(startup.stdout.as_bytes())?;
    stdout.flush()
}

#[inline]
pub(in crate::commands) fn loaded(startup: &Startup) {
    if !startup.build_stdout.is_empty() {
        print!("{}", startup.build_stdout);
        let _ = io::stdout().flush();
    }
}

pub(in crate::commands) fn failure(
    root: &Path,
    args: &[std::ffi::OsString],
    command: &str,
    startup: &Startup,
    error: io::Error,
) -> io::Result<crate::native::Outcome> {
    before(startup)?;
    emit_callback_startup(callback_error(&error));
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
        let failed_output =
            callback_error(&error).map_or("", |callback| callback.output.as_str());
        if matches!(command, "switch" | "import") {
            crate::commands::switch::render_failure_progress(output, startup, failed_output)?;
        } else {
            loaded(startup);
            print!("{failed_output}");
            let _ = io::stdout().flush();
        }
        Err(error)
    })
}

#[inline]
fn callback_error(error: &io::Error) -> Option<&crate::host::callback_error::CallbackError> {
    error
        .get_ref()
        .and_then(|error| error.downcast_ref::<crate::host::callback_error::CallbackError>())
}

#[inline]
fn emit_callback_startup(callback: Option<&crate::host::callback_error::CallbackError>) {
    if let Some(callback) = callback
        && !callback.startup.is_empty()
    {
        print!("{}", callback.startup);
        let _ = io::stdout().flush();
    }
}
