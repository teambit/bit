#[cfg(test)]
#[path = "operations_tests.rs"]
mod tests;

use super::{copy, invalid, path};
use serde::Deserialize;
use serde_json::{Value, json};
use sha1::{Digest, Sha1};
use std::{fs, io, path::PathBuf};

#[derive(Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase", deny_unknown_fields)]
pub(crate) enum Operation {
    Copy { source: PathBuf, destination: PathBuf },
    Remove { path: PathBuf },
    EnsureDir { path: PathBuf },
}
#[derive(Default)]
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
        self.token = Some(crate::validate::hexadecimal(&digest.finalize()));
        self.revision = revision;
        self.operations = operations;
        self.index = 0;
        Ok(json!({"token":self.token}))
    }
    pub(crate) fn advance(&mut self, token: &str, count: usize) -> io::Result<Value> {
        if self.token.as_deref() != Some(token.trim())
            || count == 0
            || count > self.operations.len().saturating_sub(self.index)
        {
            return Err(invalid("stale recovery operation"));
        }
        let start = self.index;
        while self.index - start < count {
            if self.operations[self.index].apply().is_err() {
                break;
            }
            self.index += 1;
        }
        Ok(
            json!({"completed":self.index-start,"nextIndex":self.index,"failed":self.index-start<count}),
        )
    }
}
impl Operation {
    fn validate(&self) -> io::Result<()> {
        match self {
            Self::Copy { source, destination } => {
                path(source)?;
                path(destination)
            }
            Self::Remove { path: filename } | Self::EnsureDir { path: filename } => path(filename),
        }
    }
    fn apply(&self) -> io::Result<()> {
        match self {
            Self::Copy { source, destination } => copy::file(source, destination),
            Self::Remove { path } => crate::workspace::actions::remove(path),
            Self::EnsureDir { path } => fs::create_dir_all(path),
        }
    }
}
