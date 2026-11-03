//! Published reset failure diagnostics ([`error`], [`with_population`], [`with_reads`], [`ObjectChange`]) retaining successful cold `VersionHistory` population prefixes.
use super::{ObjectChange, invalid, object_path};
use std::{
    fmt, fs, io,
    path::{Path, PathBuf},
};

/// Reset error carrying any cold `VersionHistory` population [`Write`]s and read proofs.
#[derive(Debug, Default, Clone, PartialEq, Eq)]
struct CanonicalError {
    message: String,
    prefix: Vec<Write>,
    proofs: Vec<(PathBuf, Option<Vec<u8>>)>,
}

/// Preimage and postimage byte pair for a cold `VersionHistory` population write.
#[derive(Debug, Default, Clone, PartialEq, Eq)]
struct Write {
    path: PathBuf,
    before: Vec<u8>,
    after: Vec<u8>,
}

impl fmt::Display for CanonicalError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(&self.message)
    }
}
impl std::error::Error for CanonicalError {}

/// Constructs a [`CanonicalError`] `io::Error` with `message` and empty population writes.
#[inline]
pub(super) fn error(message: impl Into<String>) -> io::Error {
    io::Error::other(CanonicalError {
        message: message.into(),
        prefix: Vec::new(),
        proofs: Vec::new(),
    })
}

/// Attaches cold `VersionHistory` population `changes` ([`ObjectChange`]) and `proofs` to a [`CanonicalError`].
pub(super) fn with_population(
    error: io::Error,
    objects: &Path,
    changes: Vec<ObjectChange>,
    proofs: super::proofs::ReadSet,
) -> io::Error {
    let Some(canonical) = error.get_ref().and_then(|error| error.downcast_ref::<CanonicalError>())
    else {
        return error;
    };
    let message = canonical.message.clone();
    let existing = canonical.prefix.clone();
    let existing_proofs = canonical.proofs.clone();
    let mut prefix: Vec<Write> = Vec::with_capacity(changes.len() + existing.len());
    for write in changes
        .into_iter()
        .filter_map(|change| {
            Some(Write {
                path: object_path(objects, &change.hash),
                before: change.before,
                after: change.after?,
            })
        })
        .chain(existing)
    {
        if !prefix
            .iter()
            .any(|previous| previous.path == write.path && previous.after == write.after)
        {
            prefix.push(write);
        }
    }
    io::Error::other(CanonicalError {
        message,
        prefix,
        proofs: proofs
            .into_iter()
            .chain(existing_proofs)
            .collect(),
    })
}

/// Attaches read `proofs` to an existing [`CanonicalError`] without altering its message or writes.
pub(super) fn with_reads(error: io::Error, proofs: super::proofs::ReadSet) -> io::Error {
    let Some(canonical) = error.get_ref().and_then(|error| error.downcast_ref::<CanonicalError>())
    else {
        return error;
    };
    io::Error::other(CanonicalError {
        message: canonical.message.clone(),
        prefix: canonical.prefix.clone(),
        proofs: proofs
            .into_iter()
            .chain(canonical.proofs.clone())
            .collect(),
    })
}

/// Only errors explicitly defined by released reset are owned command diagnostics.
#[must_use]
pub fn diagnostic(error: &io::Error) -> Option<&str> {
    error
        .get_ref()?
        .downcast_ref::<CanonicalError>()
        .map(|error| error.message.as_str())
}

/// Publish only the validated native graph-population prefix carried by this exact error.
pub fn apply_error_prefix(error: &io::Error) -> io::Result<()> {
    let Some(error) = error.get_ref().and_then(|error| error.downcast_ref::<CanonicalError>())
    else {
        return Ok(());
    };
    super::proofs::verify(&error.proofs)?;
    validate(&error.prefix)?;
    for write in &error.prefix {
        fs::create_dir_all(
            write.path.parent().ok_or_else(|| invalid("lane reset population path"))?,
        )?;
        fs::write(&write.path, &write.after)?;
    }
    Ok(())
}

fn validate(writes: &[Write]) -> io::Result<()> {
    let mut previous: std::collections::HashMap<&Path, &[u8]> =
        std::collections::HashMap::with_capacity(writes.len());
    for write in writes {
        if !write.path.is_absolute()
            || write.path.is_symlink()
            || write.path.parent().is_none_or(Path::is_symlink)
        {
            return Err(invalid("lane reset population symlink"));
        }
        let matches = match previous.get(write.path.as_path()) {
            Some(bytes) => *bytes == write.before,
            None => current_bytes(&write.path)? == write.before,
        };
        if !matches {
            return Err(invalid("lane reset population changed before error"));
        }
        previous.insert(&write.path, &write.after);
    }
    Ok(())
}

fn current_bytes(path: &Path) -> io::Result<Vec<u8>> {
    match fs::read(path) {
        Ok(bytes) if bytes.len() > 32 * 1024 * 1024 => Err(invalid("lane reset population budget")),
        Ok(bytes) => Ok(bytes),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(Vec::new()),
        Err(error) => Err(error),
    }
}
