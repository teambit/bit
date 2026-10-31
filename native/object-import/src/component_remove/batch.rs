//! One bitmap publication for `StashMain`'s removal of new components.
pub(super) mod cleanup;
pub(super) mod usage;

#[cfg(test)]
mod tests;
use super::{
    BitmapChange, RowKind, Selected, backup_bitmap, component_files, invalid, package,
    row::supported_row, validate_ancestors, validate_directory, validate_file_id,
};
use crate::{inspection, recovery};
use cleanup::Cleanup;
use serde_json::Value;
use std::{
    collections::HashSet,
    fs, io,
    path::{Path, PathBuf},
};

/// New components are removed together after the stash metadata has been saved.
pub struct NewBatch {
    root: PathBuf,
    bitmap: BitmapChange,
    selected: Vec<Selected>,
    cleanup: Cleanup,
}
impl NewBatch {
    /// Capture one bitmap preimage and validate every selected destination.
    pub fn prepare(root: &Path, identities: &[String]) -> io::Result<Self> {
        Self::prepare_with_components(root, identities, &[])
    }
    /// Retain effective aspect and package facts from the already loaded components.
    pub fn prepare_with_components(
        root: &Path,
        identities: &[String],
        components: &[Value],
    ) -> io::Result<Self> {
        let before = fs::read(root.join(".bitmap"))?;
        let mut bitmap = recovery::jsonc::parse(&before)?;
        let mut selected = select_all(root, &bitmap, identities)?;
        let removed: Vec<_> = selected
            .iter()
            .map(|row| row.identity.clone())
            .collect();
        usage::validate(&removed, components)?;
        custom_packages(root, &mut selected, components)?;
        let cleanup = Cleanup::prepare(root, &bitmap, &selected, components)?;
        let rows = bitmap.as_object_mut().ok_or_else(|| invalid("component bitmap"))?;
        for selected in &selected {
            rows.shift_remove(&selected.key);
        }
        let after = inspection::render_bitmap(&bitmap)?;
        Ok(Self {
            root: root.to_owned(),
            bitmap: BitmapChange { before, after },
            selected,
            cleanup,
        })
    }
    /// Check all controls and filesystem destinations before the first removal.
    pub fn validate(&self) -> io::Result<()> {
        if fs::read(self.root.join(".bitmap"))? != self.bitmap.before {
            return Err(invalid("component bitmap changed before removal"));
        }
        self.cleanup.validate()?;
        for selected in &self.selected {
            if let Some(path) = &selected.files {
                validate_ancestors(
                    &self.root,
                    path.strip_prefix(&self.root)
                        .map_err(|_| invalid("component path is outside workspace"))?,
                )?;
                validate_directory(path)?;
            }
            if selected.package.try_exists()? {
                validate_ancestors(
                    &self.root,
                    selected.package
                        .strip_prefix(&self.root)
                        .map_err(|_| invalid("package path is outside workspace"))?,
                )?;
                validate_directory(&selected.package)?;
            }
        }
        Ok(())
    }
    /// Match `removeLocallyByIds`' single bitmap write and history reason.
    pub fn commit(&self, file_id: &str) -> io::Result<()> {
        self.validate()?;
        validate_file_id(file_id)?;
        remove_sources(&self.selected)?;
        self.cleanup.manifest()?;
        for selected in &self.selected {
            if selected.package.try_exists()? {
                fs::remove_dir_all(&selected.package)?;
            }
        }
        self.cleanup.configuration(&self.root, file_id)?;
        if !self.selected.is_empty() {
            backup_bitmap(&self.root, file_id, "remove (by N/A)")?;
            fs::write(self.root.join(".bitmap"), &self.bitmap.after)?;
        }
        Ok(())
    }
}
pub(super) fn remove_sources(selected: &[Selected]) -> io::Result<()> {
    remove_source_paths(selected.iter().filter_map(|row| row.files.as_deref()))
}

pub(crate) fn remove_source_paths<'a>(paths: impl IntoIterator<Item = &'a Path>) -> io::Result<()> {
    let mut parents = Vec::new();
    for path in paths {
        super::remove_path(path)?;
        parents.push(path.parent().ok_or_else(|| invalid("component parent directory"))?);
    }
    parents.sort_unstable_by(|left, right| right.cmp(left));
    for parent in parents {
        remove_empty_parent(parent)?;
    }
    Ok(())
}

fn remove_empty_parent(parent: &Path) -> io::Result<()> {
    let entries = match fs::read_dir(parent) {
        Ok(entries) => entries,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(()),
        Err(error) => return Err(error),
    };
    for entry in entries {
        if entry?.file_name() != ".DS_Store" {
            return Ok(());
        }
    }
    match fs::remove_dir_all(parent) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error),
    }
}

fn select_all(root: &Path, bitmap: &Value, identities: &[String]) -> io::Result<Vec<Selected>> {
    let rows = bitmap.as_object().ok_or_else(|| invalid("component bitmap"))?;
    let mut keys = HashSet::new();
    let mut selected = Vec::new();
    for identity in identities {
        if identity.trim().is_empty() {
            return Err(invalid("stash removal identity is empty"));
        }
        let (key, row) = rows
            .iter()
            .find(|(key, row)| row_matches_identity(key, row, identity))
            .ok_or_else(|| invalid("component not tracked"))?;
        if !keys.insert(key) {
            return Err(invalid("duplicate stash removal component"));
        }
        selected.push(select(root, bitmap, key, row)?);
    }
    Ok(selected)
}

fn row_matches_identity(key: &str, row: &Value, identity: &str) -> bool {
    let identity = identity.trim();
    let bare = identity
        .split('@')
        .next()
        .unwrap_or(identity)
        .trim();
    if key.starts_with('$') || matches!(key, "_bit_lane" | "version") || !row.is_object() {
        return false;
    }
    let (scope, name) = crate::reset_lane::bitmap::row_identity(key, row);
    let full = match scope {
        Some(sc) => format!("{sc}/{name}"),
        None => name.to_owned(),
    };
    key.trim() == identity || name == bare || full == bare
}
fn select(root: &Path, bitmap: &Value, key: &str, row: &Value) -> io::Result<Selected> {
    let mut shape = row.clone();
    shape
        .as_object_mut()
        .ok_or_else(|| invalid("component bitmap entry"))?
        .remove("config");
    let (name, scope) = supported_row(key, &shape, RowKind::New)?;
    let (main_exists, files) = component_files(root, bitmap, key, row, false)?;
    let package = if row["rootDir"] == "." { PathBuf::new() } else { package(root, scope, name)? };
    if package.try_exists()? {
        validate_directory(&package)?;
    }
    Ok(Selected {
        key: key.to_owned(),
        identity: format!("{scope}/{name}"),
        files,
        package,
        main_exists,
        version: None,
        lane: None,
    })
}

pub(super) fn custom_packages(
    root: &Path,
    selected: &mut [Selected],
    components: &[Value],
) -> io::Result<()> {
    for row in selected {
        if row.package.as_os_str().is_empty() {
            continue;
        }
        let Some(name) = components
            .iter()
            .find(|component| component["identity"].as_str().map(str::trim) == Some(&row.identity))
            .and_then(|component| component["packageName"].as_str())
            .map(str::trim)
            .filter(|name| !name.is_empty())
        else {
            continue;
        };
        let path = Path::new(name);
        if !super::safe_relative(path) || name.contains('\\') {
            return Err(invalid("stash component package name"));
        }
        let package = root.join("node_modules").join(path);
        validate_ancestors(
            root,
            package.strip_prefix(root).map_err(|_| invalid("stash component package path"))?,
        )?;
        if package.try_exists()? {
            validate_directory(&package)?;
        }
        row.package = package;
    }
    Ok(())
}
