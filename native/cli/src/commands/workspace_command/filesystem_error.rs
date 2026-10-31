//! Released filesystem error codes, path operands, and permission guidance.
mod inspect;
use crate::commands::{color::Chalk, workspace_command};
use std::{
    fmt::{self, Write},
    io,
    path::Path,
};

#[derive(Debug)]
struct Failure {
    errno: Option<i32>,
    code: &'static str,
    message: &'static str,
    operation: String,
    path: String,
    destination: Option<String>,
}
impl Failure {
    fn description(&self) -> String {
        let mut message =
            format!("{}: {}, {} '{}'", self.code, self.message, self.operation, self.path);
        if let Some(destination) = &self.destination {
            let _ = write!(message, " -> '{destination}'");
        }
        message
    }
}
impl fmt::Display for Failure {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        if self.code == "EACCES" {
            write!(
                formatter,
                "error: you do not have permissions to access '{}', were you running bit, npm or git as root?",
                self.path,
            )
        } else {
            formatter.write_str(&self.description())
        }
    }
}
impl std::error::Error for Failure {}

pub(in crate::commands) fn report(error: &io::Error, chalk: Chalk) -> io::Error {
    let details = error
        .get_ref()
        .and_then(|error| error.downcast_ref::<Failure>())
        .filter(|_| {
            std::env::var_os("CI")
                .is_some_and(|value| {
                    !value
                        .to_string_lossy()
                        .trim()
                        .is_empty()
                })
        })
        .map(|error| inspect::render(error, chalk));
    let message = io::Error::new(error.kind(), chalk.red(&error.to_string()));
    if let Some(details) = details {
        workspace_command::with_error_details(message, details)
    } else {
        message
    }
}

pub(in crate::commands) fn paired_failure(
    error: io::Error,
    operation: &str,
    source: &Path,
    target: &Path,
) -> io::Error {
    make(error, operation, source, Some(target))
}

pub(in crate::commands) fn failure(error: io::Error, operation: &str, path: &Path) -> io::Error {
    make(error, operation, path, None)
}
fn make(error: io::Error, operation: &str, path: &Path, destination: Option<&Path>) -> io::Error {
    let (code, message) = match error.kind() {
        io::ErrorKind::NotFound => ("ENOENT", "no such file or directory"),
        io::ErrorKind::NotADirectory => ("ENOTDIR", "not a directory"),
        io::ErrorKind::AlreadyExists => ("EEXIST", "file already exists"),
        io::ErrorKind::IsADirectory => ("EISDIR", "illegal operation on a directory"),
        io::ErrorKind::DirectoryNotEmpty => ("ENOTEMPTY", "directory not empty"),
        io::ErrorKind::CrossesDevices => ("EXDEV", "cross-device link not permitted"),
        io::ErrorKind::ReadOnlyFilesystem => ("EROFS", "read-only file system"),
        io::ErrorKind::PermissionDenied if error.raw_os_error() == Some(1) => {
            ("EPERM", "operation not permitted")
        }
        io::ErrorKind::PermissionDenied => ("EACCES", "permission denied"),
        _ => return error,
    };
    let failure = Failure {
        errno: error.raw_os_error().map(|errno| -errno),
        code,
        message,
        operation: operation.into(),
        path: path.to_string_lossy().into_owned(),
        destination: destination.map(|path| path.to_string_lossy().into_owned()),
    };
    io::Error::new(error.kind(), failure)
}

/// Enumerable fields retained when an environment result serializes a filesystem error.
pub(in crate::commands) fn json(error: &io::Error) -> serde_json::Value {
    let Some(failure) = error.get_ref().and_then(|error| error.downcast_ref::<Failure>()) else {
        return serde_json::json!({});
    };
    let mut result = serde_json::json!({});
    if let Some(errno) = failure.errno {
        result["errno"] = serde_json::json!(errno);
    }
    result["code"] = serde_json::json!(failure.code);
    result["syscall"] = serde_json::json!(failure.operation);
    result["path"] = serde_json::json!(failure.path);
    if let Some(destination) = &failure.destination {
        result["dest"] = serde_json::json!(destination);
    }
    result
}

/// Original Node-style message retained by an environment's summary.
pub(in crate::commands) fn description(error: &io::Error) -> String {
    error
        .get_ref()
        .and_then(|error| error.downcast_ref::<Failure>())
        .map_or_else(|| error.to_string(), Failure::description)
}
