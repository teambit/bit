//! Crash-recovery `.bitmap` ([`bitmap`]), file-copy ([`copy_file`]), and component-reset ([`reset`], [`Operation`], [`State`]) planning primitives.

pub(crate) mod jsonc;

pub(crate) use copy::{file as copy_file, validate as validate_copy};
pub(crate) use operations::{Operation, State};

mod bitmap;
mod copy;
mod operations;
mod reset;
#[cfg(test)]
mod tests;

use serde_json::Value;
use std::{io, path::Path};

/// Plans `.bitmap` and component-directory recovery actions for `bit reset` from `input`.
#[inline]
pub(crate) fn reset(input: &Value) -> io::Result<Value> {
    reset::plan(input)
}

/// Plans `.bitmap` root-directory diffing against `current` component directories.
#[inline]
pub(crate) fn bitmap(path: &Path, current: &[String]) -> io::Result<Value> {
    bitmap::plan(path, current)
}
/// Constructs an `InvalidData` I/O error with `message`.
#[inline]
pub(crate) fn invalid(message: &str) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidData, message)
}
/// Validates that `path` is a non-empty, absolute `UTF-8` path without `.` or `..` segments or NUL bytes.
#[inline]
pub(crate) fn path(path: &Path) -> io::Result<()> {
    let Some(name) = path.to_str() else {
        return Err(invalid("invalid recovery path"));
    };
    if !path.is_absolute()
        || name.trim().is_empty()
        || name.len() > 32768
        || name.contains('\0')
        || path
            .components()
            .any(|comp| {
                matches!(comp, std::path::Component::ParentDir | std::path::Component::CurDir)
            })
    {
        return Err(invalid("invalid recovery path"));
    }
    Ok(())
}
