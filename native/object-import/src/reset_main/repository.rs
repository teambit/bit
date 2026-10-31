//! Component object and scope-index projection for a main-lane reset.

use super::{BytesChange, ObjectChange, invalid, outbound, selection::Selection};
use serde_json::Value;
use std::{
    fs, io,
    path::{Path, PathBuf},
};

pub(super) struct Repository {
    root: PathBuf,
    index_before: Vec<u8>,
    index: Value,
    position: usize,
    model_hash: String,
    model_before: Vec<u8>,
    pub(super) component: Value,
}

impl Repository {
    pub(super) fn load(root: &Path, scope: &str, name: &str) -> io::Result<Self> {
        let index_before = fs::read(root.join(".bit/index.json"))?;
        let index: Value = serde_json::from_slice(&index_before)?;
        let rows = index["components"]
            .as_array()
            .or_else(|| index.as_array())
            .ok_or_else(|| invalid("reset index components"))?;
        let position = position(rows, scope, name)?;
        let model_hash = rows[position]["hash"]
            .as_str()
            .ok_or_else(|| invalid("reset index hash"))?
            .to_owned();
        crate::merge_history::hash(&model_hash)?;
        let model_before = fs::read(object_path(root, &model_hash))?;
        let component =
            outbound::read_object(&root.join(".bit/objects"), &model_hash, "Component")?;
        validate_component(&component, scope, name)?;
        Ok(Self {
            root: root.to_owned(),
            index_before,
            index,
            position,
            model_hash,
            model_before,
            component,
        })
    }

    pub(super) fn components(&self) -> io::Result<&[Value]> {
        self.index["components"]
            .as_array()
            .or_else(|| self.index.as_array())
            .map(Vec::as_slice)
            .ok_or_else(|| invalid("reset index components"))
    }

    pub(super) fn objects(&self) -> PathBuf {
        self.root.join(".bit/objects")
    }

    pub(super) fn project(
        mut self,
        selected: &Selection,
    ) -> io::Result<(ObjectChange, Option<BytesChange>)> {
        let updated = selected.updated_model(&self.component)?;
        let after_model = updated
            .as_ref()
            .map(|value| outbound::encode_object(&self.model_hash, "Component", value))
            .transpose()?;
        let index = if updated.is_none() {
            let rows = if self.index.is_array() {
                self.index.as_array_mut()
            } else {
                self.index["components"].as_array_mut()
            }
            .ok_or_else(|| invalid("reset index components"))?;
            rows.remove(self.position);
            let mut after = serde_json::to_vec_pretty(&self.index)?;
            after.push(b'\n');
            Some(BytesChange { before: self.index_before, after })
        } else {
            None
        };
        let object =
            ObjectChange { hash: self.model_hash, before: self.model_before, after: after_model };
        Ok((object, index))
    }
}

fn position(rows: &[Value], scope: &str, name: &str) -> io::Result<usize> {
    let mut matches = rows
        .iter()
        .enumerate()
        .filter_map(|(position, row)| {
            (row["id"]["scope"] == scope && row["id"]["name"] == name).then_some(position)
        });
    let found = matches.next().ok_or_else(|| invalid("reset indexed Component absent"))?;
    if matches.next().is_some() {
        return Err(invalid("reset ambiguous index identity"));
    }
    Ok(found)
}

fn validate_component(component: &Value, scope: &str, name: &str) -> io::Result<()> {
    if component["scope"] != scope || component["name"] != name {
        return Err(invalid("reset Component identity"));
    }
    if component.get("orphanedVersions").is_some() {
        return Err(invalid("reset orphaned history"));
    }
    Ok(())
}

pub(super) fn object_path(root: &Path, hash: &str) -> PathBuf {
    root.join(".bit/objects")
        .join(&hash[..2])
        .join(&hash[2..])
}
