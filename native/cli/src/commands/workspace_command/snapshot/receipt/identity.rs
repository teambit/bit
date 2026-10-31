//! Published `getIdentity` caches its in-flight identity promise for the process.
//! Store only resolved names or the initialization error; each log still gets a fresh date.
#[cfg(test)]
mod tests;

use super::User;
use std::{io, sync::OnceLock};

static IDENTITY: Cache = Cache::new();

pub(super) fn load(factory: impl FnOnce() -> io::Result<User>) -> io::Result<User> {
    IDENTITY.load(factory)
}

struct Cache {
    value: OnceLock<Result<User, Failure>>,
}

struct Failure {
    kind: io::ErrorKind,
    message: String,
}

impl Cache {
    const fn new() -> Self {
        Self { value: OnceLock::new() }
    }

    fn load(&self, factory: impl FnOnce() -> io::Result<User>) -> io::Result<User> {
        self.value
            .get_or_init(|| {
                factory()
                    .map_err(|error| Failure { kind: error.kind(), message: error.to_string() })
            })
            .as_ref()
            .cloned()
            .map_err(|failure| io::Error::new(failure.kind, failure.message.clone()))
    }
}
