//! Published `getIdentity` caches its in-flight identity promise for the process.
//! Store only resolved names or the initialization error; each log still gets a fresh date.
//!
//! [`load`] caches resolved [`User`] identity in [`IDENTITY`] ([`Cache`]) using [`OnceLock`].
#[cfg(test)]
mod tests;

use super::User;
use std::{io, sync::OnceLock};

/// Process-wide [`Cache`] of the resolved [`User`] identity or initialization [`Failure`].
static IDENTITY: Cache = Cache::new();

/// Loads the cached [`User`] identity, initializing [`IDENTITY`] with `factory` on first call.
#[inline]
pub(super) fn load(factory: impl FnOnce() -> io::Result<User>) -> io::Result<User> {
    IDENTITY.load(factory)
}

/// Process-wide once-cell cache holding the resolved [`User`] or initialization [`Failure`].
struct Cache {
    value: OnceLock<Result<User, Failure>>,
}

/// Cached initialization error kind and trimmed message for [`Cache`].
#[derive(Debug, Clone, PartialEq, Eq)]
struct Failure {
    kind: io::ErrorKind,
    message: String,
}

impl Cache {
    /// Creates an empty [`Cache`] cell.
    #[inline]
    const fn new() -> Self {
        Self { value: OnceLock::new() }
    }

    /// Loads or initializes the cached [`User`] identity using `factory` ([`clean_field`]).
    fn load(&self, factory: impl FnOnce() -> io::Result<User>) -> io::Result<User> {
        self.value
            .get_or_init(|| {
                factory()
                    .map(|mut user| {
                        user.username = clean_field(user.username.take());
                        user.email = clean_field(user.email.take());
                        user
                    })
                    .map_err(|error| Failure {
                        kind: error.kind(),
                        message: error.to_string().trim().to_owned(),
                    })
            })
            .as_ref()
            .cloned()
            .map_err(|failure| {
                if failure.message.is_empty() {
                    io::Error::from(failure.kind)
                } else {
                    io::Error::new(failure.kind, failure.message.clone())
                }
            })
    }
}

#[inline]
fn clean_field(field: Option<String>) -> Option<String> {
    let val = field?;
    let trimmed = val.trim();
    if trimmed.is_empty() {
        None
    } else if trimmed.len() == val.len() {
        Some(val)
    } else {
        Some(trimmed.to_owned())
    }
}
