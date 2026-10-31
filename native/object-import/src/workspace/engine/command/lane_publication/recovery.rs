#[cfg(test)]
#[path = "recovery_tests.rs"]
mod tests;

use super::super::{invalid, merge::snapshot, proof};
use flate2::{Compression, write::ZlibEncoder};
use serde_json::Value;
use std::{
    fs,
    io::{self, Write},
    path::{Path, PathBuf},
};

pub(super) struct Recovery {
    directory: PathBuf,
    files: Vec<(String, Vec<u8>)>,
    proofs: Vec<proof::Proof>,
    permissions: Vec<(PathBuf, String, fs::Permissions)>,
}
impl Recovery {
    pub(super) fn prepare(root: &Path, lane: &Value) -> io::Result<Self> {
        let scope = crate::scope_path(root);
        let directory = scope.join("last-merged");
        if directory.is_symlink() {
            return Err(invalid("last merged symbolic link"));
        }
        let mut output =
            Self { directory, files: Vec::new(), proofs: Vec::new(), permissions: Vec::new() };
        for (source, destination) in [(".bitmap", "bitmap"), ("workspace.jsonc", "workspace.jsonc")]
        {
            let bytes = proof::read(&root.join(source), &mut output.proofs)?
                .ok_or_else(|| invalid("lane recovery metadata absent"))?;
            output.copy(&root.join(source), destination, bytes)?;
        }
        let staged_snaps = scope.join("staged-snaps");
        if let Some(bytes) = proof::read(&staged_snaps, &mut output.proofs)? {
            output.copy(&staged_snaps, "staged-snaps", bytes)?;
        }
        let current = &lane["current"];
        output.staged_config(root, lane)?;
        if !current.is_null() {
            output.files.insert(
                2,
                ("lane".into(), encode_lane(text(&current["hash"])?, &current["value"])?),
            );
        }
        output.validate()?;
        Ok(output)
    }
    pub(super) fn main_components(&mut self, models: &[Value]) -> io::Result<()> {
        for (index, model) in models.iter().enumerate() {
            let (_, bytes) = encode_model(model)?;
            self.files.push((format!("main-components/{index}"), bytes));
        }
        Ok(())
    }
    fn staged_config(&mut self, root: &Path, lane: &Value) -> io::Result<()> {
        let current = &lane["current"];
        let config = if current.is_null() {
            "main".to_owned()
        } else {
            let (scope, name) = lane["currentId"]
                .as_str()
                .and_then(|raw| raw.trim().split_once('/'))
                .or_else(|| {
                    Some((
                        lane["currentId"]["scope"].as_str()?,
                        lane["currentId"]["name"].as_str()?,
                    ))
                })
                .map(|(scope, name)| (scope.trim(), name.trim()))
                .filter(|(scope, name)| !scope.is_empty() && !name.is_empty())
                .ok_or_else(|| invalid("lane recovery identity"))?;
            format!("{scope}/{name}")
        };
        crate::checkout::plan::relative_path(&config)?;
        let config_path = crate::scope_path(root).join(format!("staged-config/{config}.json"));
        if let Some(bytes) = proof::read(&config_path, &mut self.proofs)? {
            let rows: Value = crate::parse_jsonc(&bytes)?;
            if !rows
                .as_array()
                .ok_or_else(|| invalid("lane recovery staged config"))?
                .is_empty()
            {
                self.copy(&config_path, "staged-config.json", bytes)?;
            }
        }
        Ok(())
    }
    fn copy(&mut self, source: &Path, destination: &str, bytes: Vec<u8>) -> io::Result<()> {
        self.permissions.push((
            source.to_owned(),
            destination.into(),
            fs::metadata(source)?.permissions(),
        ));
        self.files.push((destination.into(), bytes));
        Ok(())
    }
    pub(super) fn validate(&self) -> io::Result<()> {
        proof::verify(&self.proofs)?;
        for (source, _, permissions) in &self.permissions {
            if fs::metadata(source)?.permissions() != *permissions {
                return Err(invalid("lane recovery permissions changed"));
            }
        }
        if self.directory.is_symlink() {
            return Err(invalid("last merged symbolic link"));
        }
        Ok(())
    }
    pub(super) fn commit(&self) -> io::Result<()> {
        // Inputs intentionally describe the pre-merge state; command publication has
        // already changed them when the canonical LastMerged phase is reached.
        let removal = match fs::symlink_metadata(&self.directory) {
            Ok(metadata) if metadata.is_dir() => fs::remove_dir_all(&self.directory),
            Ok(metadata) if metadata.is_file() => fs::remove_file(&self.directory),
            Ok(_) => return Err(invalid("last merged nonordinary path")),
            Err(error) => Err(error),
        };
        match removal {
            Ok(()) => {}
            Err(error) if error.kind() == io::ErrorKind::NotFound => {}
            Err(error) => return Err(error),
        }
        fs::create_dir_all(&self.directory)?;
        for (name, bytes) in &self.files {
            let path = self.directory.join(name);
            if let Some(parent) = path.parent() {
                fs::create_dir_all(parent)?;
            }
            fs::write(path, bytes)?;
        }
        for (_, name, permissions) in &self.permissions {
            fs::set_permissions(self.directory.join(name), permissions.clone())?;
        }
        Ok(())
    }
}
fn text(value: &Value) -> io::Result<&str> {
    value
        .as_str()
        .map(str::trim)
        .filter(|text| !text.is_empty())
        .ok_or_else(|| invalid("lane recovery identity"))
}
fn encode_lane(hash: &str, value: &Value) -> io::Result<Vec<u8>> {
    let object = snapshot::object("Lane", Some(hash), value.clone())?;
    let fields = serde_json::from_value(object["fields"].clone()).map_err(io::Error::other)?;
    let body = crate::snapshot_projection::serialize("Lane", &fields, false)?;
    let length = String::from_utf8_lossy(&body).encode_utf16().count();
    let mut encoder = ZlibEncoder::new(Vec::new(), Compression::default());
    encoder.write_all(format!("Lane {hash} {length}\0").as_bytes())?;
    encoder.write_all(&body)?;
    encoder.finish()
}

pub(in crate::workspace::engine::command) fn encode_model(
    value: &Value,
) -> io::Result<(String, Vec<u8>)> {
    let object = snapshot::object("Component", None, value.clone())?;
    let fields = serde_json::from_value(object["fields"].clone()).map_err(io::Error::other)?;
    let hash = crate::snapshot_projection::identity("Component", &fields, None)?;
    let body = crate::snapshot_projection::serialize("Component", &fields, false)?;
    let length = String::from_utf8_lossy(&body).encode_utf16().count();
    let mut encoder = ZlibEncoder::new(Vec::new(), Compression::default());
    encoder.write_all(format!("Component {hash} {length}\0").as_bytes())?;
    encoder.write_all(&body)?;
    Ok((hash, encoder.finish()?))
}
