//! Token-guarded step-by-step filesystem recovery operation queue ([`Operation`], [`State`]).

#[cfg(test)]
#[path = "operations_tests.rs"]
mod tests;

use super::{copy, invalid, path};
use serde::Deserialize;
use serde_json::{Value, json};
use sha1::{Digest, Sha1};
use std::{fs, io, path::PathBuf};

/// Single filesystem recovery step (`Copy`, `Remove`, or `EnsureDir`).
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase", deny_unknown_fields)]
pub(crate) enum Operation {
    Copy { source: PathBuf, destination: PathBuf },
    Remove { path: PathBuf },
    EnsureDir { path: PathBuf },
}
#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub(crate) struct State {
    token: Option<String>,
    operations: Vec<Operation>,
    index: usize,
    revision: u64,
}
impl State {
    pub(crate) fn initialize(
        &mut self,
        operations: Vec<Operation>,
        bytes: &[u8],
    ) -> io::Result<Value> {
        if operations.len() > 4096 || operations.is_empty() {
            return Err(invalid("recovery operation count"));
        }
        for operation in &operations {
            operation.validate()?;
        }
        let Some(revision) = self.revision.checked_add(1) else {
            self.token = None;
            self.operations.clear();
            return Err(invalid("recovery revision exhausted"));
        };
        let mut digest = Sha1::new();
        digest.update(revision.to_be_bytes());
        digest.update(bytes);
        let token = crate::validate::hexadecimal(&digest.finalize());
        let output = json!({"token": &token});
        self.token = Some(token);
        self.revision = revision;
        self.operations = operations;
        self.index = 0;
        Ok(output)
    }
    pub(crate) fn advance(&mut self, token: &str, count: usize) -> io::Result<Value> {
        let token = token.trim();
        if token.is_empty()
            || self.token.as_deref() != Some(token)
            || count == 0
            || count > self.operations.len().saturating_sub(self.index)
        {
            return Err(invalid("stale recovery operation"));
        }
        let start = self.index;
        for operation in &self.operations[start..start + count] {
            if operation.apply().is_err() {
                break;
            }
            self.index += 1;
        }
        let completed = self.index - start;
        Ok(json!({"completed":completed,"nextIndex":self.index,"failed":completed<count}))
    }
}
impl Operation {
    fn validate(&self) -> io::Result<()> {
        match self {
            Self::Copy { source, destination } => {
                path(source)?;
                path(destination)?;
                if source == destination {
                    return Err(invalid("copy source and destination are identical"));
                }
                Ok(())
            }
            Self::Remove { path: filename } | Self::EnsureDir { path: filename } => path(filename),
        }
    }
    fn apply(&self) -> io::Result<()> {
        match self {
            Self::Copy { source, destination } => copy::file(source, destination),
            Self::Remove { path } => crate::workspace::actions::remove(path),
            Self::EnsureDir { path } => {
                if fs::symlink_metadata(path).is_ok_and(|meta| meta.file_type().is_symlink()) {
                    return Err(invalid("recovery ensure dir is a symlink"));
                }
                fs::create_dir_all(path)
            }
        }
    }
}
