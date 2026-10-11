use std::{
    fs,
    io::{self, Read, Write},
    path::{Path, PathBuf},
};

use super::{MAX_BYTES, MAX_FILES, MAX_PATH, Response, invalid};
use crate::protocol;

struct Action {
    kind: u32,
    source: PathBuf,
    destination: Option<PathBuf>,
}

/// Validate the full action frame before applying a sequential filesystem prefix.
pub(crate) fn serve(reader: &mut impl Read, writer: &mut impl Write) -> io::Result<()> {
    let id = protocol::word(reader)?;
    let actions = request(reader)?;
    let mut response =
        Response { version: 1, id, completed: 0, skipped: Vec::new(), failed: false };
    for action in &actions {
        if apply(action).is_err() {
            response.failed = true;
            break;
        }
        response.completed += 1;
    }
    protocol::respond(writer, &response)
}

fn request(reader: &mut impl Read) -> io::Result<Vec<Action>> {
    let count = protocol::word(reader)?;
    if !(1..=MAX_FILES).contains(&count) {
        return Err(invalid("workspace action count out of bounds"));
    }
    let mut actions = Vec::with_capacity(count as usize);
    let mut total = 0;
    for _ in 0..count {
        let kind = protocol::word(reader)?;
        if kind > 3 {
            return Err(invalid("invalid workspace action kind"));
        }
        let source = action_path(reader, &mut total)?
            .ok_or_else(|| invalid("workspace action source is empty"))?;
        let destination = action_path(reader, &mut total)?;
        if (kind < 2) != destination.is_none() {
            return Err(invalid("invalid workspace action destination"));
        }
        actions.push(Action { kind, source, destination });
    }
    Ok(actions)
}

fn action_path(reader: &mut impl Read, total: &mut usize) -> io::Result<Option<PathBuf>> {
    let length = protocol::word(reader)? as usize;
    *total += length;
    if length > MAX_PATH || *total > MAX_BYTES {
        return Err(invalid("workspace action path bytes out of bounds"));
    }
    if length == 0 {
        return Ok(None);
    }
    let mut bytes = vec![0; length];
    reader.read_exact(&mut bytes)?;
    let name = String::from_utf8(bytes).map_err(|_| invalid("workspace action path is not UTF-8"))?;
    let path = PathBuf::from(&name);
    if !path.is_absolute() || name.contains('\0') {
        return Err(invalid("workspace action path must be absolute and contain no NUL"));
    }
    Ok(Some(path))
}

fn apply(action: &Action) -> io::Result<()> {
    match action.kind {
        0 => remove(&action.source),
        1 => remove_empty(&action.source),
        _ => link(
            &action.source,
            action.destination.as_deref().expect("validated destination"),
            action.kind == 3,
        ),
    }
}

fn remove(path: &Path) -> io::Result<()> {
    let metadata = match fs::symlink_metadata(path) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(()),
        Err(error) => return Err(error),
    };
    let result =
        if metadata.is_dir() { fs::remove_dir_all(path) } else { remove_leaf(path, &metadata) };
    match result {
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(()),
        result => result,
    }
}

#[cfg(not(windows))]
fn remove_leaf(path: &Path, _metadata: &fs::Metadata) -> io::Result<()> {
    fs::remove_file(path)
}

#[cfg(windows)]
fn remove_leaf(path: &Path, metadata: &fs::Metadata) -> io::Result<()> {
    use std::os::windows::fs::FileTypeExt;
    if metadata.file_type().is_symlink_dir() { fs::remove_dir(path) } else { fs::remove_file(path) }
}

fn remove_empty(path: &Path) -> io::Result<()> {
    let entries = match fs::read_dir(path) {
        Ok(entries) => entries,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(()),
        Err(error) => return Err(error),
    };
    for entry in entries {
        if entry?.file_name() != ".DS_Store" {
            return Ok(());
        }
    }
    // Canonical removeEmptyDir checks readdir then uses fs-extra.remove (including
    // unlinking a directory symlink rather than removing the linked directory).
    remove(path)
}

#[cfg(windows)]
fn link(source: &Path, destination: &Path, avoid_hard_link: bool) -> io::Result<()> {
    // Node's directory junction and privileged-symlink fallbacks remain canonical.
    // Regular-file hard links need neither and can use the native fast path.
    if avoid_hard_link || !fs::metadata(source)?.is_file() {
        return Err(io::Error::new(
            io::ErrorKind::Unsupported,
            "Windows link requires canonical fallback",
        ));
    }
    remove(destination)?;
    if avoid_hard_link && source == destination {
        return Err(invalid("workspace symlink path is the same as target"));
    }
    fs::create_dir_all(
        destination.parent().ok_or_else(|| invalid("workspace link has no parent"))?,
    )?;
    fs::hard_link(source, destination)
}

#[cfg(unix)]
fn link(source: &Path, destination: &Path, avoid_hard_link: bool) -> io::Result<()> {
    remove(destination)?;
    if avoid_hard_link && source == destination {
        return Err(invalid("workspace symlink path is the same as target"));
    }
    fs::create_dir_all(
        destination.parent().ok_or_else(|| invalid("workspace link has no parent"))?,
    )?;
    for attempt in 1..=5 {
        let result = link_once(source, destination, avoid_hard_link);
        match result {
            Ok(()) => return Ok(()),
            Err(error) if error.kind() == io::ErrorKind::AlreadyExists => {
                if !retry_link(source, destination, attempt, error)? {
                    return Ok(());
                }
            }
            Err(error) => return Err(error),
        }
    }
    Err(invalid("workspace link retry exhausted"))
}

#[cfg(unix)]
fn link_once(source: &Path, destination: &Path, avoid_hard_link: bool) -> io::Result<()> {
    if avoid_hard_link {
        std::os::unix::fs::symlink(source, destination)
    } else {
        hard_link(source, destination)
    }
}

#[cfg(unix)]
fn retry_link(
    source: &Path,
    destination: &Path,
    attempt: u64,
    error: io::Error,
) -> io::Result<bool> {
    if linked_correctly(source, destination) {
        return Ok(false);
    }
    if attempt == 5 {
        return Err(error);
    }
    std::thread::sleep(std::time::Duration::from_millis(50 * attempt));
    if linked_correctly(source, destination) {
        return Ok(false);
    }
    tolerate_locked_destination(remove(destination))?;
    Ok(true)
}

#[cfg(unix)]
fn tolerate_locked_destination(result: io::Result<()>) -> io::Result<()> {
    match result {
        Err(error)
            if matches!(
                error.kind(),
                io::ErrorKind::PermissionDenied | io::ErrorKind::ResourceBusy,
            ) =>
        {
            Ok(())
        }
        result => result,
    }
}

#[cfg(unix)]
fn hard_link(source: &Path, destination: &Path) -> io::Result<()> {
    match fs::hard_link(source, destination) {
        Err(error) if error.raw_os_error() == Some(1) => {
            std::os::unix::fs::symlink(source, destination)
        }
        Err(error) if error.raw_os_error() == Some(18) => {
            match fs::hard_link(source, destination) {
                Err(error) if matches!(error.raw_os_error(), Some(1 | 18)) => {
                    std::os::unix::fs::symlink(source, destination)
                }
                result => result,
            }
        }
        result => result,
    }
}

#[cfg(unix)]
fn linked_correctly(source: &Path, destination: &Path) -> bool {
    use std::os::unix::fs::MetadataExt;
    if let (Ok(source), Ok(destination)) = (fs::metadata(source), fs::metadata(destination))
        && source.ino() != 0
        && source.ino() == destination.ino()
        && source.dev() == destination.dev()
    {
        return true;
    }
    fs::read_link(destination).is_ok_and(|target| target == source)
}

#[cfg(test)]
mod tests;
