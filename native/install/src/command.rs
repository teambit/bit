//! `bit install` orchestration: `install.cmd.tsx` and `InstallMain.install`.

mod calculate;
mod external;
mod modules;
mod packages;
mod restore;
mod session;
mod summary;
mod workspace_jsonc;

use crate::{
    Host, HostInfo,
    model::DependencyMap,
    options::{self, Parsed},
    output::{Output, Sink, Style},
};
use session::{Loaded, Session};
use std::{fs, io, path::Path, time::Instant};

const UPDATE_EXISTING: &str = r#"--update-existing is deprecated, please omit it. "bit install" will update existing dependencies by default"#;

/// What the command did, for the final summary line.
#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct InstallSummary {
    pub components: usize,
}

/// The result of one `bit install` invocation.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Outcome {
    Installed(InstallSummary),
    /// `--help`: the JavaScript entry point renders Bit's command help.
    Help,
    /// The workspace uses a JavaScript package manager (yarn): the TypeScript
    /// command installs it.
    Unsupported,
}

/// Run `bit install` with `argv` (starting at the command name) in the
/// workspace containing `cwd`.
pub async fn run(
    cwd: &Path,
    argv: &[String],
    info: &HostInfo,
    host: &dyn Host,
    sink: Sink,
) -> io::Result<Outcome> {
    let options = match options::parse(argv)? {
        Parsed::Help => return Ok(Outcome::Help),
        Parsed::Install(options) => options,
    };
    let session = Session {
        root: session::find_root(cwd)?,
        options: &options,
        info,
        host,
        output: Output::new(info.color, info.columns.is_some(), info.loader, sink),
        started: Instant::now(),
    };
    Box::pin(install(&session)).await
}

async fn install(session: &Session<'_>) -> io::Result<Outcome> {
    let options = session.options;
    if options.update_existing {
        session.output.warning(UPDATE_EXISTING);
    }
    let mut loaded = Loaded::load(session)?;
    if loaded.uses_yarn() {
        return Ok(Outcome::Unsupported);
    }
    let packages = packages::validate(&options.packages, &loaded)?;
    let name = session.output.paint(Style::Cyan, &loaded.workspace_name(&session.root));
    session.output.console(&format!("Resolving component dependencies for workspace: '{name}'"));
    loaded = Box::pin(prepare(session, loaded, &packages)).await?;
    if !options.skip_import {
        crate::import::import_current_objects(
            &session.root,
            &loaded.workspace.scope_path,
            &loaded.global,
            session.info,
            &session.output,
        )
        .await?;
        loaded = Loaded::load(session)?;
    }
    let scope_path = loaded.workspace.scope_path.clone();
    let installed = Box::pin(modules::install(session, loaded)).await?;
    publish_post_install_event(&scope_path)?;
    let report = summary::format(
        &session.output,
        installed.components,
        session.started.elapsed(),
        options.recurring_install,
        &installed.old_non_loaded_envs,
    );
    session.output.print(&report);
    Ok(Outcome::Installed(InstallSummary { components: installed.components }))
}

/// External package manager mode, then `bit install <packages>` and `--add-missing-peers`.
async fn prepare(
    session: &Session<'_>,
    mut loaded: Loaded,
    packages: &[String],
) -> io::Result<Loaded> {
    if loaded.config.dependency_resolver.external_package_manager == Some(true) {
        external::switch(session, &loaded).await?;
        loaded = Loaded::load(session)?;
    }
    if !packages.is_empty() {
        packages::add(session, &loaded, packages, session.options.lifecycle()).await?;
        loaded = Loaded::load(session)?;
    }
    if session.options.add_missing_peers {
        loaded = Box::pin(add_missing_peers(session, loaded)).await?;
    }
    Ok(loaded)
}

/// `--add-missing-peers`: the root's missing peers join the workspace policy.
async fn add_missing_peers(session: &Session<'_>, loaded: Loaded) -> io::Result<Loaded> {
    let calculated = calculate::calculate(session, &loaded, &DependencyMap::default()).await?;
    let plan = &calculated.outcome.plan;
    let missing =
        crate::engine::missing_peers(&plan.projects, &plan.overrides, &loaded.engine).await?;
    if missing.is_empty() {
        session.output.console("No missing peer dependencies found.");
        return Ok(loaded);
    }
    let packages: Vec<String> = missing
        .iter()
        .map(|(name, range)| format!("{name}@{range}"))
        .collect();
    packages::add(session, &loaded, &packages, "peer").await?;
    Loaded::load(session)
}

/// `publishIpcEvent('onPostInstall')`: watchers (`bit start`, `bit watch`) reload on it.
fn publish_post_install_event(scope_path: &Path) -> io::Result<()> {
    let events = scope_path.join("events");
    fs::create_dir_all(&events)?;
    fs::write(events.join("onPostInstall"), "")
}
