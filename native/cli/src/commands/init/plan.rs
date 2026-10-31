//! Retain provisioning inputs and execute the same ordered filesystem ownership as init.
use super::{options::Options, scope};
use crate::commands::workspace_command::{self, NodeCli};
use std::{
    fs,
    io::{self, IsTerminal},
    path::{Component, Path, PathBuf},
};

pub(super) enum Action {
    Directory(PathBuf),
    File(PathBuf, Vec<u8>),
    Remove(PathBuf),
    Empty(PathBuf),
}
pub(super) struct Plan {
    pub root: PathBuf,
    pub created: bool,
    pub actions: Vec<Action>,
    pub warning: String,
    pub modules: PathBuf,
    pub git: bool,
}

pub(super) fn prepare(options: &Options) -> io::Result<Plan> {
    let cwd = std::env::current_dir()?;
    let requested = resolve(&cwd, options.path.as_deref());
    let root =
        if options.bare.is_some() { requested } else { locate(&requested).unwrap_or(requested) };
    validate_root(&root, &cwd, options)?;
    let cli = NodeCli::find()?;
    let modules = cli.bit_dir
        .parent()
        .ok_or_else(|| io::Error::other("init published modules"))?
        .to_owned();
    let git = root.join(".git").exists();
    validate_interactive(&root, options, git)?;
    let scope = if options.bare.is_some() {
        root.clone()
    } else if options.flags.standalone {
        root.join(".bit")
    } else {
        bit_workspace_config::scope_path(&root)
    };
    let created = !has_workspace(&root);
    let mut plan =
        Plan { root, created, actions: Vec::new(), warning: String::new(), modules, git };
    plan_scope(&mut plan, &scope, options, &cwd, &cli.version)?;
    if options.bare.is_none() {
        super::workspace::prepare(&mut plan, &scope, options)?;
    }
    Ok(plan)
}

fn plan_scope(
    plan: &mut Plan,
    path: &Path,
    options: &Options,
    cwd: &Path,
    version: &str,
) -> io::Result<()> {
    let clear_scope = options.bare.is_none()
        && (options.resets.hard
            || options.resets.scope
            || options.resets.new
            || options.resets.lane_new);
    if clear_scope {
        plan.actions.push(Action::Empty(path.to_owned()));
    } else if options.bare.is_none() && options.resets.repair {
        plan.actions.push(Action::Remove(path.join("index.json")));
    }
    let name = scope_name(options, cwd)?;
    let bytes = scope::document(
        path,
        &name,
        options.shared.as_deref().filter(|_| options.bare.is_some()),
        version,
        options.resets.hard,
    )?;
    for directory in
        [path.to_owned(), path.join("components"), path.join("tmp"), path.join("objects")]
    {
        plan.actions.push(Action::Directory(directory));
    }
    plan.actions.push(Action::File(path.join("scope.json"), bytes));
    super::index::prepare(plan, path, options)?;
    Ok(())
}

fn scope_name(options: &Options, cwd: &Path) -> io::Result<String> {
    if let Some(bare) = options.bare.as_deref() {
        let fallback = cwd
            .file_name()
            .unwrap_or_default()
            .to_string_lossy();
        return Ok(resolve_bare_scope_name(bare, &fallback));
    }
    scope::local_name(cwd)
}

fn resolve_bare_scope_name(bare: &str, fallback: &str) -> String {
    let trimmed = bare.trim();
    if trimmed.is_empty() || trimmed.eq_ignore_ascii_case("true") {
        fallback.trim().to_owned()
    } else {
        trimmed.to_owned()
    }
}

fn locate(start: &Path) -> Option<PathBuf> {
    start
        .ancestors()
        .find(|path| has_workspace(path))
        .map(Path::to_owned)
}
fn has_workspace(path: &Path) -> bool {
    ["workspace.jsonc", ".bitmap", ".bit.map.json", ".bit/scope.json", ".git/bit/scope.json"]
        .iter()
        .any(|name| path.join(name).exists())
}
fn resets(options: &Options) -> bool {
    let reset = &options.resets;
    reset.repair || reset.hard || reset.scope || reset.new || reset.lane_new
}

pub(super) fn backup(
    plan: &mut Plan,
    scope: &Path,
    path: &Path,
    directory: &str,
    metadata: &str,
    prefix: &str,
) -> io::Result<()> {
    if let Ok(bytes) = fs::read(path) {
        backup_bytes(plan, scope, directory, metadata, prefix, bytes);
    }
    Ok(())
}

pub(super) fn backup_bytes(
    plan: &mut Plan,
    scope: &Path,
    directory: &str,
    metadata: &str,
    prefix: &str,
    bytes: Vec<u8>,
) {
    let id = workspace_command::file_id();
    plan.actions.push(Action::File(
        scope
            .join(directory.trim())
            .join(format!("{}{id}", prefix.trim())),
        bytes,
    ));
    let metadata_path = scope.join(metadata.trim());
    let mut bytes = plan.actions
        .iter()
        .rev()
        .find_map(|action| match action {
            Action::File(path, bytes) if path == &metadata_path => Some(bytes.clone()),
            _ => None,
        })
        .unwrap_or_else(|| {
            let cleared = plan.actions.iter().any(
                |action| matches!(action, Action::Empty(path) if metadata_path.starts_with(path)),
            );
            if cleared { Vec::new() } else { fs::read(&metadata_path).unwrap_or_default() }
        });
    bytes.extend(format!("{id} \n").as_bytes());
    plan.actions.push(Action::File(metadata_path, bytes));
}

fn resolve(cwd: &Path, requested: Option<&str>) -> PathBuf {
    let absolute = requested
        .map(str::trim)
        .filter(|path| !path.is_empty())
        .map_or_else(|| cwd.to_owned(), |path| cwd.join(path));
    let mut resolved = PathBuf::new();
    for component in absolute.components() {
        match component {
            Component::CurDir => {}
            Component::ParentDir => {
                resolved.pop();
            }
            component => resolved.push(component.as_os_str()),
        }
    }
    resolved
}

fn validate_root(root: &Path, cwd: &Path, options: &Options) -> io::Result<()> {
    if options.path.is_none() && root != cwd && options.bare.is_none() {
        return Err(io::Error::other(format!(
            r#"error: unable to init a new workspace in an inner directory of an existing workspace at "{}""#,
            root.display(),
        )));
    }
    if options.bare.is_none() {
        super::config::existing(&root.join("workspace.jsonc"))?;
    }
    Ok(())
}

fn validate_interactive(root: &Path, options: &Options, git: bool) -> io::Result<()> {
    let interactive = io::stdin().is_terminal() && io::stdout().is_terminal();
    let skip_wizard = !interactive
        || options.flags.skip_interactive
        || options.flags.standalone
        || options.flags.external_pm;
    let existing_workspace = || has_workspace(root) || resets(options);
    if git && !skip_wizard && !existing_workspace() && options.bare.is_none() {
        return Err(io::Error::other("init interactive Git setup requires the published wizard"));
    }
    Ok(())
}
