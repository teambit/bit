//! Retain wildcard discovery history writes and validate every mutable input before publication.
use super::{HistoryBytes, candidates, invalid};
use crate::store::Store;
use serde_json::Value;
use sha1::{Digest, Sha1};
use std::{
    collections::BTreeMap,
    fs, io,
    path::{Path, PathBuf},
};

#[derive(Default)]
pub(in super::super) struct Prepared {
    root: PathBuf,
    histories: Vec<HistoryBytes>,
    preimages: BTreeMap<PathBuf, Option<Vec<u8>>>,
}

pub(super) fn prepare(root: &Path) -> io::Result<Prepared> {
    let mut prepared = Prepared { root: root.to_owned(), ..Prepared::default() };
    let scope = crate::scope_path(root);
    for path in [root.join(".bitmap"), scope.join("scope.json"), scope.join("index.json")] {
        prepared.capture(path)?;
    }
    let index: Value = crate::parse_jsonc(
        prepared.preimages
            .get(&scope.join("index.json"))
            .and_then(Option::as_deref)
            .ok_or_else(|| invalid("outbound prefilter index absent"))?,
    )?;
    for row in index["components"]
        .as_array()
        .or_else(|| index.as_array())
        .ok_or_else(|| invalid("outbound prefilter index"))?
    {
        prepared.capture_component(&scope.join("objects"), row)?;
    }
    prepared.histories = candidates::histories(root)?;
    prepared.validate()?;
    Ok(prepared)
}

impl Prepared {
    fn capture(&mut self, path: PathBuf) -> io::Result<()> {
        let before = read(&path)?;
        self.preimages.insert(path, before);
        Ok(())
    }
    fn capture_component(&mut self, objects: &Path, row: &Value) -> io::Result<()> {
        let model = row["hash"]
            .as_str()
            .map(str::trim)
            .ok_or_else(|| invalid("outbound prefilter model"))?;
        let model = crate::validate::hexadecimal(&crate::merge_history::hash(model)?);
        self.capture(
            objects
                .join(&model[..2])
                .join(&model[2..]),
        )?;
        let (scope, name) =
            crate::workspace::engine::command::inbound::remote::file_list::row_scoped_id_parts(row)
                .ok_or_else(|| invalid("outbound prefilter id"))?;
        let hash =
            crate::validate::hexadecimal(&Sha1::digest(format!("{scope}/{name}:VersionHistory")));
        self.capture(
            objects
                .join(&hash[..2])
                .join(&hash[2..]),
        )
    }
    fn validate(&self) -> io::Result<()> {
        for (path, before) in &self.preimages {
            if read(path)? != *before {
                return Err(invalid("outbound wildcard discovery changed after prepare"));
            }
        }
        Ok(())
    }
    pub(in super::super) fn stage(&self) -> io::Result<()> {
        self.validate()?;
        if self.histories.is_empty() {
            return Ok(());
        }
        let store = Store::new(crate::scope_path(&self.root).join("objects"), None)?;
        for history in &self.histories {
            store.write(&history.hash, &history.bytes)?;
        }
        Ok(())
    }
}

fn read(path: &Path) -> io::Result<Option<Vec<u8>>> {
    match fs::read(path) {
        Ok(bytes) => Ok(Some(bytes)),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(error),
    }
}

#[cfg(test)]
mod tests;
