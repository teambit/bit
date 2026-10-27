//! Filesystem failures serialized by the released environment service runner.
use super::{Value, invalid, json};
use std::{io, path::Path};

pub(in crate::commands) fn error(
    error: io::Error,
    path: &Path,
    syscall: &str,
) -> io::Result<Value> {
    let (code, unix_errno, windows_errno) = match error.kind() {
        io::ErrorKind::PermissionDenied => ("EACCES", -13, -4092),
        io::ErrorKind::NotFound => ("ENOENT", -2, -4058),
        io::ErrorKind::NotADirectory => ("ENOTDIR", -20, -4052),
        io::ErrorKind::IsADirectory => ("EISDIR", -21, -4068),
        io::ErrorKind::ReadOnlyFilesystem => ("EROFS", -30, -4034),
        _ => return Err(error),
    };
    let errno = if cfg!(windows) { windows_errno } else { unix_errno };
    Ok(json!({"errno":errno,"code":code,"syscall":syscall,"path":path}))
}

pub(in crate::commands) fn message(service: &str, error: &Value) -> io::Result<String> {
    let code = error["code"].as_str().ok_or_else(|| invalid("service error code"))?;
    let description = match code {
        "EACCES" => "permission denied",
        "ENOENT" => "no such file or directory",
        "ENOTDIR" => "not a directory",
        "EISDIR" => "illegal operation on a directory",
        "EROFS" => "read-only file system",
        _ => return Err(invalid("service filesystem error")),
    };
    let path = error["path"].as_str().ok_or_else(|| invalid("service error path"))?;
    let syscall = error["syscall"].as_str().ok_or_else(|| invalid("service error syscall"))?;
    Ok(format!(
        r#"service "{service}" of env "teambit.harmony/node" has failed. error: {code}: {description}, {syscall} '{path}'"#,
    ))
}
