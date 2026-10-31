//! Native `bit clone <component-id> [dir]` (`scopes/workspace/workspace-root/clone.cmd.ts`).

#[cfg(test)]
mod tests;

use super::{Command, workspace_command};
use crate::{native::Outcome, workspace};
use std::{
    env,
    ffi::OsString,
    fs, io,
    path::{Path, PathBuf},
};

pub const COMMAND: Command = Command { name: "clone", aliases: &[], run };

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct Options {
    pub id: String,
    pub dir: Option<String>,
    pub lane: Option<String>,
    pub remote: Option<String>,
    pub skip_dependency_installation: bool,
}

fn run(args: &[OsString]) -> io::Result<Outcome> {
    let Some(argv) = workspace_command::utf8_args(args) else {
        return Ok(Outcome::Declined("clone arguments are not UTF-8".into()));
    };
    let Some(options) = parse_options(&argv[1..]) else {
        return Ok(Outcome::Declined("outside native clone grammar".into()));
    };
    if env::var_os("CI").is_some_and(|val| !val.is_empty()) {
        return Ok(Outcome::Declined("CI clone error stack delegated".into()));
    }
    let cwd = env::current_dir()?;
    if let Some(ws_root) = workspace::root(&cwd) {
        let msg = format!(
            r#"unable to clone inside the workspace at "{}", a clone is a new workspace. run it from a directory outside of any workspace"#,
            ws_root.display(),
        );
        return workspace_command::execute_then(&ws_root, args, "clone", |_| {
            Err(io::Error::other(msg))
        });
    }
    if let Some(err_msg) = validate_outside_workspace(&cwd, &options)? {
        return workspace_command::execute_failure_scope(
            &cwd,
            args,
            "clone",
            false,
            "",
            io::Error::other(err_msg),
        );
    }
    Ok(Outcome::Declined("clone remote workspace initialization delegated".into()))
}

pub(super) fn parse_options(args: &[&str]) -> Option<Options> {
    let mut options = Options {
        id: String::new(),
        dir: None,
        lane: None,
        remote: None,
        skip_dependency_installation: false,
    };
    let mut iter = args.iter().copied();
    while let Some(arg) = iter.next() {
        if arg == "--" {
            for rest in iter {
                apply_clone_positional(rest, &mut options)?;
            }
            break;
        }
        apply_clone_arg(arg, &mut iter, &mut options)?;
    }
    (!options.id.is_empty()).then_some(options)
}

fn apply_clone_positional(val: &str, options: &mut Options) -> Option<()> {
    let val = val.trim();
    (!val.is_empty() && !val.starts_with('-')).then_some(())?;
    if options.id.is_empty() {
        val.clone_into(&mut options.id);
    } else if options.dir.is_none() {
        options.dir = Some(val.to_owned());
    } else {
        return None;
    }
    Some(())
}

fn apply_clone_arg<'a>(
    arg: &'a str,
    iter: &mut impl Iterator<Item = &'a str>,
    options: &mut Options,
) -> Option<()> {
    match arg {
        "--no-color" | "--no-color=true" | "--no-color=false" => {}
        "-x" | "--skip-dependency-installation" | "--skip-dependency-installation=true" => {
            options.skip_dependency_installation = true;
        }
        "--skip-dependency-installation=false" => options.skip_dependency_installation = false,
        "-l" | "--lane" => options.lane = Some(take_non_flag(iter.next()?)?),
        "--remote" => options.remote = Some(take_non_flag(iter.next()?)?),
        _ if let Some(val) = arg
            .strip_prefix("--lane=")
            .or_else(|| arg.strip_prefix("-l=")) =>
        {
            options.lane = Some(take_non_flag(val)?);
        }
        _ if let Some(val) = arg.strip_prefix("--remote=") => {
            options.remote = Some(take_non_flag(val)?);
        }
        val => apply_clone_positional(val, options)?,
    }
    Some(())
}

fn take_non_flag(val: &str) -> Option<String> {
    let trimmed = val.trim();
    (!trimmed.is_empty() && !trimmed.starts_with('-')).then(|| trimmed.to_owned())
}

pub(super) fn validate_outside_workspace(
    cwd: &Path,
    options: &Options,
) -> io::Result<Option<String>> {
    let comp_name = match validate_component_id(&options.id) {
        Ok(name) => name,
        Err(err) => return Ok(Some(err)),
    };
    let raw_target = options.dir.as_deref().unwrap_or(&comp_name);
    let resolved_lexical = resolve_clone_path(cwd, raw_target);
    let workspace_path = resolve_through_existing_ancestors(&resolved_lexical)?;
    if let Some(ws_above) = workspace::root(&workspace_path) {
        return Ok(Some(format!(
            "unable to clone into \"{}\", it is inside the workspace at \"{}\".\na clone creates a workspace of its own, run it outside any workspace",
            workspace_path.display(),
            ws_above.display(),
        )));
    }
    if let Some(dir_err) = check_empty_dir(&workspace_path)? {
        return Ok(Some(dir_err));
    }
    if let Some(lane) = &options.lane
        && !lane.contains('/')
        && options.remote.is_none()
    {
        return Ok(Some(format!(
            r#"unable to clone from lane "{lane}", the lane must be given with its scope, e.g. "my-org.my-scope/{lane}""#,
        )));
    }
    Ok(None)
}

fn validate_component_id(id: &str) -> Result<String, String> {
    let Some((scope, full_name)) = id
        .split('@')
        .next()
        .and_then(|without_ver| without_ver.split_once('/'))
        .filter(|(scope, full_name)| !scope.is_empty() && !full_name.is_empty())
    else {
        return Err(format!(
            r#"error: component ID "{id}" is invalid, please use the following format: [scope]/<name>"#,
        ));
    };
    if let Err(super::scope_set::Failure::User(err)) =
        super::scope_set::selection::validate_scope_name(scope)
            .and_then(|()| super::scope_set::selection::validate_component_name(full_name))
    {
        return Err(err);
    }
    parse_component_name(id).ok_or_else(|| {
        format!(
            r#"error: component ID "{id}" is invalid, please use the following format: [scope]/<name>"#,
        )
    })
}

pub(super) fn parse_component_name(id_str: &str) -> Option<String> {
    let without_ver = id_str.split('@').next()?;
    let (scope, full_name) = without_ver.split_once('/')?;
    if scope.is_empty() || full_name.is_empty() || full_name.ends_with('/') {
        return None;
    }
    let name = full_name.rsplit('/').next()?;
    (!name.is_empty()).then(|| name.to_owned())
}

fn resolve_clone_path(cwd: &Path, dir: &str) -> PathBuf {
    let candidate = Path::new(dir);
    let joined =
        if candidate.is_absolute() { candidate.to_path_buf() } else { cwd.join(candidate) };
    normalize_lexical(&joined)
}

fn normalize_lexical(path: &Path) -> PathBuf {
    let mut out = PathBuf::new();
    for comp in path.components() {
        match comp {
            std::path::Component::CurDir => {}
            std::path::Component::ParentDir => {
                out.pop();
            }
            other => out.push(other.as_os_str()),
        }
    }
    out
}

fn resolve_through_existing_ancestors(dir_path: &Path) -> io::Result<PathBuf> {
    let Some(parent) = dir_path.parent() else {
        return Ok(dir_path.to_path_buf());
    };
    if parent == dir_path || parent.as_os_str().is_empty() {
        return Ok(dir_path.to_path_buf());
    }
    let Some(file_name) = dir_path.file_name() else {
        return Ok(dir_path.to_path_buf());
    };
    Ok(realpath_of_nearest_existing(parent)?.join(file_name))
}

fn realpath_of_nearest_existing(dir_path: &Path) -> io::Result<PathBuf> {
    let Some(parent) = dir_path.parent() else {
        return Ok(dir_path.to_path_buf());
    };
    if parent == dir_path || parent.as_os_str().is_empty() {
        return Ok(dir_path.to_path_buf());
    }
    match fs::canonicalize(dir_path) {
        Ok(canon) => Ok(canon),
        Err(err) if err.kind() == io::ErrorKind::NotFound => {
            let Some(file_name) = dir_path.file_name() else {
                return Ok(dir_path.to_path_buf());
            };
            Ok(realpath_of_nearest_existing(parent)?.join(file_name))
        }
        Err(err) => Err(err),
    }
}

fn check_empty_dir(dir_path: &Path) -> io::Result<Option<String>> {
    let meta = match fs::symlink_metadata(dir_path) {
        Ok(meta) => meta,
        Err(err) if err.kind() == io::ErrorKind::NotFound => return Ok(None),
        Err(err) => return Err(err),
    };
    if meta.file_type().is_symlink() {
        return Ok(Some(format!(
            r#"unable to clone into "{}", it is a symbolic link and the workspace would be written through it"#,
            dir_path.display(),
        )));
    }
    if !meta.file_type().is_dir() {
        return Ok(Some(format!(
            r#"unable to clone into "{}", it is not a directory"#,
            dir_path.display(),
        )));
    }
    if fs::read_dir(dir_path)?.next().is_some() {
        return Ok(Some(format!(
            r#"unable to clone into "{}", the directory is not empty"#,
            dir_path.display(),
        )));
    }
    Ok(None)
}
