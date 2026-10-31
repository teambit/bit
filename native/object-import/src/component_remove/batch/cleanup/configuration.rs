//! Comment-preserving `WorkspaceConfig.removeExtension` and its backup history.
use super::{Change, read_optional};
use bit_workspace_config::jsonc::Document;
use std::{
    fs,
    io::{self, Write},
    path::Path,
};
pub(super) struct Configuration(Change);
impl Configuration {
    pub(super) fn prepare(root: &Path, identities: &[&str]) -> io::Result<Option<Self>> {
        let path = root.join("workspace.jsonc");
        let Some(before) = read_optional(&path)? else {
            return Ok(None);
        };
        let mut document =
            Document::parse(std::str::from_utf8(&before).map_err(io::Error::other)?)?;
        let mut changed = false;
        for identity in identities {
            changed |= remove(&mut document, identity);
        }
        if !changed {
            return Ok(None);
        }
        let text = format!("{document}\n");
        let after = if cfg!(windows) {
            text.replace("\r\n", "\n").replace('\n', "\r\n")
        } else {
            text.replace("\r\n", "\n")
        }
        .into_bytes();
        Ok(Some(Self(Change { path, before, after })))
    }
    pub(super) fn validate(&self) -> io::Result<()> {
        self.0.validate()
    }
    pub(super) fn write(&self, root: &Path, file_id: &str) -> io::Result<()> {
        let _ = self.backup(root, file_id);
        self.0.write()
    }
    fn backup(&self, root: &Path, file_id: &str) -> io::Result<()> {
        let base = crate::scope_path(root).join("workspace-config-history");
        fs::create_dir_all(base.join("files"))?;
        fs::write(base.join("files").join(file_id), &self.0.before)?;
        let mut metadata = fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(base.join("metadata.txt"))?;
        writeln!(metadata, "{file_id} remove components")
    }
}
fn remove(document: &mut Document, identity: &str) -> bool {
    let value = document.value();
    let existing = value
        .as_object()
        .and_then(|values| {
            values
                .keys()
                .find(|key| key.as_str() == identity || key.starts_with(&format!("{identity}@")))
        })
        .cloned();
    let mut changed = existing.is_some_and(|key| document.remove(&[&key]));
    let gen_key = value
        .as_object()
        .and_then(|values| {
            values
                .keys()
                .find(|key| {
                    key.as_str() == "teambit.generator/generator"
                        || key.starts_with("teambit.generator/generator@")
                })
        })
        .cloned()
        .unwrap_or_else(|| "teambit.generator/generator".to_owned());
    if let Some(mut envs) = document
        .get(&[&gen_key, "envs"])
        .and_then(|value| value.as_array().cloned())
        && let Some(index) = envs
            .iter()
            .position(|env| {
                env.as_str()
                    .is_some_and(|val| val == identity || val.starts_with(&format!("{identity}@")))
            })
    {
        envs.remove(index);
        document.set(&[&gen_key, "envs"], &serde_json::Value::Array(envs));
        changed = true;
    }
    changed
}
