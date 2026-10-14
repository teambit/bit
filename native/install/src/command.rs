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
    Host, HostInfo, engine,
    model::DependencyMap,
    options::{self, InstallOptions, Parsed},
    output::{Output, Sink, Style},
};
use session::{Loaded, Session};
use std::{fs, io, path::Path, sync::OnceLock, time::Instant};

const UPDATE_EXISTING: &str = r#"--update-existing is deprecated, please omit it. "bit install" will update existing dependencies by default"#;

/// What the command did, for the final summary line.
#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct InstallSummary {
    pub components: usize,
    /// Legacy envs whose dependency policy is still unknown (`getOldNonLoadedEnvs`).
    pub old_non_loaded_envs: Vec<String>,
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
    run_with_options(cwd, &options, info, host, sink).await
}

/// Install with already-parsed options: `bit install` after argv parsing, or
/// `InstallMain.install` called by another command (`options.programmatic`).
pub async fn run_with_options(
    cwd: &Path,
    options: &InstallOptions,
    info: &HostInfo,
    host: &dyn Host,
    sink: Sink,
) -> io::Result<Outcome> {
    let session = Session {
        root: session::find_root(cwd)?,
        options,
        info,
        host,
        output: Output::new(info.color, info.columns.is_some(), info.loader, sink)
            .with_console(info.write_to_console.unwrap_or(info.loader))
            .with_ci(std::env::var_os("CI").is_some_and(|ci| !ci.is_empty())),
        started: Instant::now(),
        cloud_username: OnceLock::new(),
    };
    Box::pin(install(&session)).await
}

async fn install(session: &Session<'_>) -> io::Result<Outcome> {
    let options = session.options;
    let Some((loaded, packages)) = begin(session).await? else {
        return Ok(Outcome::Unsupported);
    };
    let mut loaded = Box::pin(prepare(session, loaded, &packages)).await?;
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
    if !options.programmatic {
        let report = summary::format(
            &session.output,
            installed.components,
            session.started.elapsed(),
            options.recurring_install,
            &installed.old_non_loaded_envs,
        );
        session.output.print(&report);
    }
    Ok(Outcome::Installed(InstallSummary {
        components: installed.components,
        old_non_loaded_envs: installed.old_non_loaded_envs,
    }))
}

/// Load the workspace and take the command over: `None` when the TypeScript
/// path installs it. `bit install` prints the runner and "Resolving..." lines
/// and resolves component ids among the packages; `InstallMain.install` does not.
async fn begin(session: &Session<'_>) -> io::Result<Option<(Loaded, Vec<String>)>> {
    let options = session.options;
    if options.update_existing {
        session.output.warning(UPDATE_EXISTING);
    }
    let mut loaded = Loaded::load(session)?;
    if loaded.uses_yarn() || declines_external_mode(options, &loaded) {
        return Ok(None);
    }
    if options.programmatic {
        resolve_cloud_username(session, &mut loaded).await;
        return Ok(Some((loaded, options.packages.clone())));
    }
    // `CommandRunner.determineConsoleWritingDuringCommand`, once the command is ours.
    session.output.status(r#"running command "install"..."#);
    let packages = packages::validate(&options.packages, &loaded)?;
    resolve_cloud_username(session, &mut loaded).await;
    let name = session.output.paint(Style::Cyan, &loaded.workspace_name(&session.root));
    session.output.console(&format!("Resolving component dependencies for workspace: '{name}'"));
    Ok(Some((loaded, packages)))
}

/// Without `showExternalPackageManagerPrompt`, `InstallMain.install` writes the
/// dependencies to `package.json` instead of installing: the TypeScript path does that.
fn declines_external_mode(options: &InstallOptions, loaded: &Loaded) -> bool {
    !options.external_prompt
        && loaded.config.dependency_resolver.external_package_manager == Some(true)
}

/// `PnpmPackageManager.getNetworkConfig`: the user agent names the cloud user.
/// Looked up once, before the first engine call; later reloads reuse it.
async fn resolve_cloud_username(session: &Session<'_>, loaded: &mut Loaded) {
    if !loaded.engine.registry.cloud_user_agent {
        return;
    }
    let username = engine::cloud_username(&loaded.global, engine::CLOUD_LOOKUP_TIMEOUT).await;
    if let Some(username) = &username {
        engine::apply_cloud_username(&mut loaded.engine, username);
    }
    let _ = session.cloud_username.set(username);
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
