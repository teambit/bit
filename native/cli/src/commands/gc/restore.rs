//! Restore claimed backups; leave a failed recovery discoverable by the next invocation.
mod copy;
use super::{
    Options, bare,
    io_error::{failure, paired_failure},
};
use crate::{
    commands::{
        color::Chalk,
        remote_action::startup,
        workspace_command::{self, format::Formatter, results::Report},
    },
    native::Outcome,
};
use std::{
    ffi::OsString,
    fs, io,
    path::Path,
    process,
    time::{SystemTime, UNIX_EPOCH},
};

#[derive(Debug)]
pub(super) enum Error {
    Missing(String),
    Filesystem(io::Error),
}
impl Error {
    pub(super) fn report(self, chalk: Chalk) -> io::Error {
        match self {
            Self::Missing(message) => io::Error::other(message),
            Self::Filesystem(error) => super::io_error::report(&error, chalk),
        }
    }
}
impl From<io::Error> for Error {
    fn from(error: io::Error) -> Self {
        Self::Filesystem(error)
    }
}

/// Semantic CI errors carry released JavaScript stacks; decline those layouts before claiming backups.
pub(super) fn preflight(scope: &Path) -> io::Result<()> {
    if cfg!(windows) {
        return Err(io::Error::other(
            "Windows recovery identity and error parity requires the published runtime",
        ));
    }
    if std::env::var_os("CI").is_none_or(|value| value.is_empty()) {
        return Ok(());
    }
    let mut candidates = find_restoring_leftovers(scope);
    if scope.join("deleted-objects").exists() {
        candidates.push("deleted-objects".into());
    }
    if candidates.is_empty() {
        return Err(io::Error::other("missing recovery backup requires released CI diagnostics"));
    }
    for candidate in candidates {
        copy::preflight(&scope.join(candidate), &scope.join("objects"))?;
    }
    Ok(())
}
pub(super) fn run(scope_dir: &Path, overwrite: bool) -> Result<(), Error> {
    let deleted_dir = scope_dir.join("deleted-objects");
    let mut candidates = find_restoring_leftovers(scope_dir);
    candidates.push("deleted-objects".into());
    let mut staged = Vec::new();
    let now_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    let pid = process::id();
    for dir in candidates {
        let claimed = format!("deleted-objects.restoring-{now_ms}-{pid}-{}", staged.len());
        if fs::rename(scope_dir.join(&dir), scope_dir.join(&claimed)).is_ok() {
            staged.push(claimed);
        }
    }
    if staged.is_empty() {
        return Err(Error::Missing(format!(
            "there is nothing to restore, \"{}\" doesn't exist.\nit is only created by a garbage collection that ran with --backup",
            deleted_dir.display(),
        )));
    }
    let objects_dir = scope_dir.join("objects");
    for staging in staged {
        let src = scope_dir.join(&staging);
        if let Err(err) = copy::run(&src, &objects_dir, overwrite) {
            rollback(&src, &deleted_dir)?;
            return Err(err.into());
        }
        remove_backup(&src)?;
    }
    Ok(())
}

fn find_restoring_leftovers(scope_dir: &Path) -> Vec<String> {
    let Ok(entries) = fs::read_dir(scope_dir) else {
        return Vec::new();
    };
    let mut names = entries
        .filter_map(Result::ok)
        .filter_map(|entry| entry.file_name().into_string().ok())
        .filter(|name| name.starts_with("deleted-objects.restoring-"))
        .collect::<Vec<_>>();
    names.sort();
    names
}

fn rollback(source: &Path, target: &Path) -> io::Result<()> {
    if !target.exists() {
        fs::rename(source, target)
            .map_err(|error| paired_failure(error, "rename", source, target))?;
    }
    Ok(())
}

fn remove_backup(path: &Path) -> io::Result<()> {
    let metadata = fs::symlink_metadata(path).map_err(|error| failure(error, "lstat", path))?;
    if !metadata.is_dir() {
        return fs::remove_file(path).map_err(|error| failure(error, "unlink", path));
    }
    let entries = fs::read_dir(path).map_err(|error| failure(error, "scandir", path))?;
    let mut first_error = None;
    for entry in entries {
        if let Err(error) = entry.and_then(|entry| remove_backup(&entry.path())) {
            first_error.get_or_insert(error);
        }
    }
    if let Some(error) = first_error {
        return Err(error);
    }
    fs::remove_dir(path).map_err(|error| failure(error, "rmdir", path))
}

pub(super) fn workspace(root: &Path, args: &[OsString], options: &Options) -> io::Result<Outcome> {
    let scope = bit_workspace_config::scope_path(root);
    let index = match preflight(&scope).and_then(|()| workspace_index(root, &scope)) {
        Ok(index) => index,
        Err(error) => return Ok(Outcome::Declined(format!("restore startup preflight: {error}"))),
    };
    let chalk = Chalk::detect(args);
    let work = |_: &bit_install::output::Output| {
        if let Some(bytes) = index {
            let path = scope.join("index.json");
            fs::write(&path, bytes).map_err(|error| failure(error, "open", &path))?;
        }
        run(&scope, options.restore_overwrite).map_err(|error| error.report(chalk))?;
        let data = if options.json {
            serde_json::to_string_pretty(&serde_json::json!({"restored": true}))?
        } else {
            Formatter::new(chalk).success_summary("restored the objects from the backup directory")
        };
        Ok(Report { data, code: 0, details: None })
    };
    if options.json {
        workspace_command::execute_json(root, args, "gc", work)
    } else {
        workspace_command::execute_then(root, args, "gc", work)
    }
}
pub(super) fn workspace_index(root: &Path, scope: &Path) -> io::Result<Option<Vec<u8>>> {
    let document = bit_workspace_config::jsonc::Document::parse(&fs::read_to_string(root.join(
        "workspace.jsonc",
    ))?)?;
    if !startup::supported(Some(root), scope, &document.value(), true)? {
        return Err(io::Error::other("configured workspace startup callbacks"));
    }
    bare::restore_index(scope)
}
