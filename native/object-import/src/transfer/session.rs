use std::{
    collections::{HashMap, HashSet},
    io,
    path::PathBuf,
};

use serde_json::Value;
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
