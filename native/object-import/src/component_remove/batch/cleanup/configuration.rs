//! Comment-preserving `WorkspaceConfig.removeExtension` edits ([`Configuration`]) and backup history.
use super::{Change, read_optional};
use bit_workspace_config::jsonc::Document;
use std::{
    fs,
    io::{self, Write},
    path::Path,
};
/// Retained comment-preserving `workspace.jsonc` edit removing component aspect entries.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct Configuration(Change);
impl Configuration {
    /// Prepare a comment-preserving `workspace.jsonc` edit removing aspect entries for `identities`.
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
        } else if text.contains("\r\n") {
            text.replace("\r\n", "\n")
        } else {
            text
        }
        .into_bytes();
        Ok(Some(Self(Change { path, before, after })))
    }
    /// Verify that `workspace.jsonc` on disk still matches the pre-removal byte snapshot.
    #[inline]
    pub(super) fn validate(&self) -> io::Result<()> {
        self.0.validate()
    }
    /// Back up `workspace.jsonc` under `.bit/workspace-config-history` and write the updated file.
    #[inline]
    pub(super) fn write(&self, root: &Path, file_id: &str) -> io::Result<()> {
        self.backup(root, file_id)?;
        self.0.write()
    }
    /// Persist the pre-removal `workspace.jsonc` snapshot and history entry for `file_id`.
    fn backup(&self, root: &Path, file_id: &str) -> io::Result<()> {
        crate::component_remove::validate_file_id(file_id)?;
        let file_id = file_id.trim();
        let base = crate::scope_path(root).join("workspace-config-history");
        let files_dir = base.join("files");
        fs::create_dir_all(&files_dir)?;
        fs::write(files_dir.join(file_id), &self.0.before)?;
        let mut metadata = fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(base.join("metadata.txt"))?;
        writeln!(metadata, "{file_id} remove components")
    }
}
/// Remove top-level aspect entries and `teambit.generator/generator` `envs` matching `identity` from [`Document`].
fn remove(document: &mut Document, identity: &str) -> bool {
    let value = document.value();
    let keys: Vec<_> = value
        .as_object()
        .into_iter()
        .flat_map(|values| values.keys())
        .filter(|key| matches_aspect_identity(key, identity))
        .cloned()
        .collect();
    let mut changed = false;
    for key in keys {
        changed |= document.remove(&[&key]);
    }
    let gen_key = value
        .as_object()
        .and_then(|values| {
            values.keys().find(|key| matches_aspect_identity(key, "teambit.generator/generator"))
        })
        .cloned()
        .unwrap_or_else(|| "teambit.generator/generator".to_owned());
    if let Some(mut envs) = document
        .get(&[&gen_key, "envs"])
        .and_then(|value| value.as_array().cloned())
    {
        let before_len = envs.len();
        envs.retain(|env| !env.as_str().is_some_and(|val| matches_aspect_identity(val, identity)));
        if envs.len() != before_len {
            document.set(&[&gen_key, "envs"], &serde_json::Value::Array(envs));
            changed = true;
        }
    }
    changed
}

fn matches_aspect_identity(candidate: &str, identity: &str) -> bool {
    let (candidate, identity) = (candidate.trim(), identity.trim());
    candidate
        .strip_prefix(identity)
        .is_some_and(|rest| rest.is_empty() || rest.starts_with('@'))
}
