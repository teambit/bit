use std::{
    collections::{HashMap, HashSet},
    fs, io,
    path::PathBuf,
};

use serde_json::{Value, json};
use sha1::{Digest, Sha1};

use super::{invalid, owned, transaction};

#[derive(Default)]
pub(crate) struct State {
    pub(super) spool_paths: HashSet<PathBuf>,
    pub(super) collections: HashMap<String, Vec<owned::Entry>>,
    pub(super) plans: HashMap<String, owned::Plan>,
    transaction: Option<transaction::Transaction>,
    revision: u64,
}

impl State {
    pub(super) fn cancel(&mut self, input: &Value) -> io::Result<Value> {
        if !input.is_null()
            && input
                .as_object()
                .is_none_or(|object| !object.is_empty())
        {
            return Err(invalid("unsupported transfer cancellation"));
        }
        let collections = self.collections.len();
        let plans = self.plans.len();
        self.collections.clear();
        self.plans.clear();
        self.transaction = None;
        self.cleanup_unused()?;
        Ok(json!({"cancelled":true,"releasedCollections":collections,"releasedPlans":plans}))
    }

    pub(super) fn cleanup_unused(&mut self) -> io::Result<()> {
        let retained = self.collections
            .values()
            .flatten()
            .chain(self.plans.values().flat_map(|plan| plan.entries.iter()))
            .filter_map(|entry| entry.path.as_ref())
            .collect::<HashSet<_>>();
        let paths = self.spool_paths
            .iter()
            .filter(|path| !retained.contains(path))
            .cloned()
            .collect::<Vec<_>>();
        for path in paths {
            match fs::remove_file(&path) {
                Ok(()) => {}
                Err(error) if error.kind() == io::ErrorKind::NotFound => {}
                Err(error) => return Err(error),
            }
            self.spool_paths.remove(&path);
        }
        Ok(())
    }

    pub(super) fn token(&mut self, bytes: &[u8]) -> io::Result<String> {
        self.revision =
            self.revision.checked_add(1).ok_or_else(|| invalid("transfer identity limit"))?;
        let mut digest = Sha1::new();
        digest.update(self.revision.to_be_bytes());
        digest.update(bytes);
        Ok(crate::validate::hexadecimal(&digest.finalize()))
    }

    pub(super) fn transaction(&mut self, input: &Value) -> io::Result<Value> {
        let request = serde::Deserialize::deserialize(input).map_err(io::Error::other)?;
        let bytes = serde_json::to_vec(input).map_err(io::Error::other)?;
        let token = self.token(&bytes)?;
        let transaction = transaction::Transaction::initialize(request, token)?;
        let output = transaction.output();
        self.transaction = Some(transaction);
        Ok(output)
    }

    pub(super) fn receipt(&mut self, input: &Value) -> io::Result<Value> {
        let request = serde::Deserialize::deserialize(input).map_err(io::Error::other)?;
        self.transaction
            .as_mut()
            .ok_or_else(|| invalid("no owned transfer transaction"))?
            .receipt(&request)
    }
}
