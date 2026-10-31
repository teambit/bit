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
        let scope_dir = crate::scope_path(root);
        let index_before = fs::read(scope_dir.join("index.json"))?;
        let index: Value = crate::parse_jsonc(&index_before)?;
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
            outbound::read_object(&scope_dir.join("objects"), &model_hash, "Component")?;
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
        crate::scope_path(&self.root).join("objects")
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
            let (row_scope, row_name) =
                crate::workspace::engine::command::inbound::remote::file_list::row_id_parts(row)
                    .map_or(("", ""), |(sc, nm)| (sc.unwrap_or_default(), nm));
            (row["isSymlink"] != true
                && (row_scope == scope || row_scope.is_empty())
                && row_name == name)
                .then_some(position)
        });
    let found = matches.next().ok_or_else(|| invalid("reset indexed Component absent"))?;
    if matches.next().is_some() {
        return Err(invalid("reset ambiguous index identity"));
    }
    Ok(found)
}

fn validate_component(component: &Value, scope: &str, name: &str) -> io::Result<()> {
    let comp_scope = component["scope"].as_str().map_or("", str::trim);
    if (!comp_scope.is_empty() && comp_scope != scope)
        || component["name"].as_str().map(str::trim) != Some(name)
    {
        return Err(invalid("reset Component identity"));
    }
    if component
        .get("orphanedVersions")
        .is_some_and(|val| {
            !val.is_null() && !val.as_object().is_some_and(serde_json::Map::is_empty)
        })
    {
        return Err(invalid("reset orphaned history"));
    }
    Ok(())
}

pub(super) fn object_path(root: &Path, hash: &str) -> PathBuf {
    crate::scope_path(root)
        .join("objects")
        .join(&hash[..2])
        .join(&hash[2..])
}
