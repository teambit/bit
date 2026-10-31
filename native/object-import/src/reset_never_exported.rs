//! `bit reset --never-exported` clears versions of unscoped bitmap entries.

#[cfg(test)]
mod tests;

use serde_json::Value;
use sha1::{Digest, Sha1};
use std::{
    fs, io,
    path::{Path, PathBuf},
};

type SelectedRow = (String, PathBuf, Option<Vec<u8>>);

pub struct Plan {
    root: PathBuf,
    before: Vec<u8>,
    after: Vec<u8>,
    objects: Vec<(PathBuf, Option<Vec<u8>>)>,
    pub labels: Vec<String>,
}

impl Plan {
    pub fn prepare(root: &Path) -> io::Result<Self> {
        let before = fs::read(root.join(".bitmap"))?;
        let mut bitmap = crate::recovery::jsonc::parse(&before)?;
        let rows = bitmap.as_object_mut().ok_or_else(|| invalid("never-exported bitmap"))?;
        if rows.contains_key("_bit_lane") {
            return Err(invalid("never-exported active lane"));
        }
        let mut labels = Vec::new();
        let mut objects = Vec::new();
        for (key, row) in rows.iter_mut() {
            if let Some((label, path, data)) = select_row(root, key, row)? {
                labels.push(label);
                objects.push((path, data));
                row.as_object_mut()
                    .ok_or_else(|| invalid("never-exported row"))?
                    .insert("version".into(), Value::String(String::new()));
            }
        }
        let after = crate::inspection::render_bitmap(&bitmap)?;
        Ok(Self { root: root.to_owned(), before, after, objects, labels })
    }

    pub fn commit(&self, file_id: &str) -> io::Result<()> {
        let file_id = file_id.trim();
        crate::reset_main::validate_file_id(file_id)?;
        let fresh = Self::prepare(&self.root)?;
        if self.before != fresh.before
            || self.after != fresh.after
            || self.labels != fresh.labels
            || self.objects != fresh.objects
        {
            return Err(invalid("never-exported changed during preparation"));
        }
        for (path, before) in &self.objects {
            if before.is_some() {
                if fs::symlink_metadata(path).is_ok_and(|meta| meta.file_type().is_symlink()) {
                    return Err(invalid("never-exported object symlink"));
                }
                fs::remove_file(path)?;
            }
        }
        let scope_dir = crate::scope_path(&self.root);
        let directory = scope_dir.join("bitmap-history");
        fs::create_dir_all(&directory)?;
        fs::copy(self.root.join(".bitmap"), directory.join(format!(".bitmap-{file_id}")))?;
        use std::io::Write;
        writeln!(
            fs::OpenOptions::new()
                .create(true)
                .append(true)
                .open(scope_dir.join("bitmap-history-metadata.txt"))?,
            "{file_id} reset (never-exported)",
        )?;
        fs::write(self.root.join(".bitmap"), &self.after)
    }
}

fn select_row(root: &Path, key: &str, row: &Value) -> io::Result<Option<SelectedRow>> {
    let key = key.trim();
    if is_ignored_row(key, row) {
        return Ok(None);
    }
    if row["isAvailableOnCurrentLane"] == false
        || crate::workspace::engine::client_status::config::is_config_removed(&row["config"])
    {
        return Err(invalid("never-exported unavailable component"));
    }
    let (row_scope, name) = crate::reset_lane::bitmap::row_identity(key, row);
    let name = name.trim();
    if name.is_empty() {
        return Err(invalid("never-exported name"));
    }
    let scope = row_scope
        .map(str::trim)
        .filter(|scope| !scope.is_empty())
        .ok_or_else(|| invalid("never-exported default scope"))?;
    let version = row["version"]
        .as_str()
        .map(str::trim)
        .filter(|ver| !ver.is_empty())
        .or_else(|| key.rsplit_once('@').map(|(_, ver)| ver.trim()))
        .unwrap_or_default();
    let identity = format!("{scope}/{name}");
    let label = if version.is_empty() { identity } else { format!("{identity}@{version}") };
    let hash = format!("{:x}", Sha1::digest(name.as_bytes()));
    let path = crate::scope_path(root)
        .join("objects")
        .join(&hash[..2])
        .join(&hash[2..]);
    let data = match fs::read(&path) {
        Ok(data) => Some(data),
        Err(error) if error.kind() == io::ErrorKind::NotFound => None,
        Err(error) => return Err(error),
    };
    Ok(Some((label, path, data)))
}

fn is_ignored_row(key: &str, row: &Value) -> bool {
    key.starts_with('$')
        || key == "_bit_lane"
        || key == "version"
        || !row.is_object()
        || row["scope"]
            .as_str()
            .is_some_and(|scope| !scope.trim().is_empty())
}

fn invalid(message: &str) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidData, message)
}
