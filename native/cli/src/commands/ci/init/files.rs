//! Publish the onboarding files in the released command's order.
use super::{git, report::File};
use bit_workspace_config::jsonc::Document;
use serde_json::json;
use std::{fs, io, path::Path};
const ASPECT: &str = "teambit.git/ci";

pub(super) fn workflows(
    root: &Path,
    cwd: &Path,
    branch: &str,
    workspace_dir: &str,
) -> io::Result<Vec<File>> {
    let mut files = Vec::new();
    for (relative, raw, marker) in [
        (
            ".github/workflows/bit-sync.yml",
            include_str!("bit-sync.yml"),
            "branches-ignore: [main, 'bit-sync/**']",
        ),
        (".github/workflows/bit-release.yml", include_str!("bit-release.yml"), "branches: [main]"),
    ] {
        let path = root
            .join(relative)
            .components()
            .collect::<std::path::PathBuf>();
        let status = if path.exists() {
            "skipped"
        } else {
            write_workflow(&path, &render(raw, marker, branch, workspace_dir))?;
            "written"
        };
        files.push(File { relative, display: git::display(cwd, &path), status, note: None });
    }
    Ok(files)
}
fn write_workflow(path: &Path, content: &str) -> io::Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| failure(error, "mkdir", parent))?;
    }
    fs::write(path, content).map_err(|error| failure(error, "open", path))
}
fn render(raw: &str, marker: &str, branch: &str, workspace_dir: &str) -> String {
    let branch = branch.trim();
    let workspace_dir = workspace_dir.trim();
    let quoted = |value: &str| format!("'{}'", value.replace('\'', "''"));
    let replacement = marker.replacen("main", &quoted(branch), 1);
    // JavaScript template literals normalize source CRLF, including Windows checkouts.
    let rendered = raw.replace("\r\n", "\n").replacen(marker, &replacement, 1);
    if workspace_dir.is_empty() || workspace_dir == "." {
        return rendered;
    }
    rendered.replacen(
        "# ws-dir: packages/my-workspace",
        &format!("ws-dir: {}", quoted(workspace_dir)),
        1,
    )
}
/// Versioned or malformed extension configs still require the original `setExtension` behavior.
pub(super) fn supported(document: &Document) -> bool {
    let value = document.value();
    let Some(entries) = value.as_object() else {
        return false;
    };
    entries
        .iter()
        .all(|(name, config)| {
            bit_install::config::aspect_id_without_version(name) != ASPECT
                || (name == ASPECT && (config.is_object() || !bit_workspace_config::truthy(config)))
        })
}
pub(super) fn config(root: &Path) -> io::Result<bool> {
    let mut document = Document::parse(&fs::read_to_string(root.join("workspace.jsonc"))?)?;
    if document
        .get(&[ASPECT, "sync"])
        .is_some_and(|value| bit_workspace_config::truthy(&value))
    {
        return Ok(false);
    }
    document.set(&[ASPECT, "sync"], &json!({}));
    bit_install::command::edit_workspace_config(
        root,
        &bit_workspace_config::scope_path(root),
        &crate::commands::workspace_command::file_id(),
        "bit ci sync --init: add the sync config block",
        |current| *current = document,
    )
    .map_err(|error| failure(error, "open", &root.join("workspace.jsonc")))?;
    Ok(true)
}
fn failure(error: io::Error, operation: &str, path: &Path) -> io::Error {
    let error = if cfg!(windows)
        && operation == "mkdir"
        && error.kind() == io::ErrorKind::AlreadyExists
        && path
            .ancestors()
            .skip(1)
            .any(Path::is_file)
    {
        io::Error::from(io::ErrorKind::NotADirectory)
    } else {
        error
    };
    if cfg!(unix) && error.kind() == io::ErrorKind::PermissionDenied {
        return io::Error::new(
            error.kind(),
            format!(
                "error: you do not have permissions to access '{}', were you running bit, npm or git as root?",
                path.display(),
            ),
        );
    }
    let (code, message) = match error.kind() {
        io::ErrorKind::PermissionDenied if cfg!(windows) => ("EPERM", "operation not permitted"),
        io::ErrorKind::PermissionDenied => ("EACCES", "permission denied"),
        io::ErrorKind::NotFound => ("ENOENT", "no such file or directory"),
        io::ErrorKind::AlreadyExists => ("EEXIST", "file already exists"),
        io::ErrorKind::NotADirectory => ("ENOTDIR", "not a directory"),
        io::ErrorKind::IsADirectory => ("EISDIR", "illegal operation on a directory"),
        io::ErrorKind::InvalidFilename => ("ENAMETOOLONG", "name too long"),
        _ => return error,
    };
    io::Error::new(error.kind(), format!("{code}: {message}, {operation} '{}'", path.display()))
}

pub(super) fn read(path: &Path) -> io::Result<String> {
    if path.is_dir() {
        return Err(io::Error::new(
            io::ErrorKind::IsADirectory,
            "EISDIR: illegal operation on a directory, read",
        ));
    }
    fs::read(path)
        .map(|bytes| String::from_utf8_lossy(&bytes).into_owned())
        .map_err(|error| {
            if error.kind() == io::ErrorKind::IsADirectory {
                io::Error::new(error.kind(), "EISDIR: illegal operation on a directory, read")
            } else {
                failure(error, "open", path)
            }
        })
}
pub(super) fn write(path: &Path, content: &str) -> io::Result<()> {
    fs::write(path, content).map_err(|error| failure(error, "open", path))
}
