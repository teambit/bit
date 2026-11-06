//! Filesystem failures serialized by the released environment service runner.
//!
//! [`error`], [`message`], and [`non_empty`] encode [`io::Error`] and [`Path`] details into a JSON [`Value`].
use super::{Value, invalid, json};
use std::{io, path::Path};

/// Serializes `error` ([`io::Error`]) at `path` ([`Path`]) for `syscall` into a Node.js-compatible `{ errno, code, syscall, path }` [`Value`].
#[inline]
pub(in crate::commands) fn error(
    error: io::Error,
    path: &Path,
    syscall: &str,
) -> io::Result<Value> {
    let (code, unix_errno, windows_errno) = match error.kind() {
        io::ErrorKind::PermissionDenied if error.raw_os_error() == Some(1) => ("EPERM", -1, -4048),
        io::ErrorKind::PermissionDenied => ("EACCES", -13, -4092),
        io::ErrorKind::NotFound => ("ENOENT", -2, -4058),
        io::ErrorKind::AlreadyExists => ("EEXIST", -17, -4075),
        io::ErrorKind::NotADirectory => ("ENOTDIR", -20, -4052),
        io::ErrorKind::IsADirectory => ("EISDIR", -21, -4068),
        io::ErrorKind::ReadOnlyFilesystem => ("EROFS", -30, -4034),
        io::ErrorKind::DirectoryNotEmpty => ("ENOTEMPTY", -39, -4051),
        _ => return Err(error),
    };
    let errno = if cfg!(windows) { windows_errno } else { unix_errno };
    Ok(json!({"errno":errno,"code":code,"syscall":syscall.trim(),"path":path}))
}

/// Extracts a trimmed, non-empty string slice from `val` ([`Value`]).
#[inline]
fn non_empty(val: &Value) -> Option<&str> {
    val.as_str()
        .map(str::trim)
        .filter(|text| !text.is_empty())
}

/// Maps a POSIX/Node.js error `code` to its lowercase human-readable description.
#[inline]
fn code_description(code: &str) -> Option<&'static str> {
    match code {
        "EPERM" => Some("operation not permitted"),
        "EACCES" => Some("permission denied"),
        "ENOENT" => Some("no such file or directory"),
        "EEXIST" => Some("file already exists"),
        "ENOTDIR" => Some("not a directory"),
        "EISDIR" => Some("illegal operation on a directory"),
        "EROFS" => Some("read-only file system"),
        "ENOTEMPTY" => Some("directory not empty"),
        _ => None,
    }
}

/// Formats a human-readable environment service failure message for `service`, `environment`, and `error` ([`Value`]) via [`code_description`].
#[inline]
pub(in crate::commands) fn message(
    service: &str,
    environment: &str,
    error: &Value,
) -> io::Result<String> {
    let code = non_empty(&error["code"]).ok_or_else(|| invalid("service error code"))?;
    let description = code_description(code).ok_or_else(|| invalid("service filesystem error"))?;
    let path = non_empty(&error["path"])
        .or_else(|| non_empty(&error["filePath"]))
        .ok_or_else(|| invalid("service error path"))?;
    let syscall = non_empty(&error["syscall"]).ok_or_else(|| invalid("service error syscall"))?;
    let service = service.trim();
    let environment = environment.trim();
    Ok(format!(
        r#"service "{service}" of env "{environment}" has failed. error: {code}: {description}, {syscall} '{path}'"#,
    ))
}
