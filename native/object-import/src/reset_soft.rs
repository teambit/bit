//! `bit reset --soft` clears pending bitmap tags without touching objects.

#[cfg(test)]
mod tests;

use serde_json::Value;
use std::{
    fs, io,
    path::{Path, PathBuf},
};

/// A component and the pending tag removed from its bitmap entry.
pub struct Entry {
    pub identity: String,
    pub version: String,
}

pub struct Plan {
    root: PathBuf,
    pattern: Option<String>,
    selected: Option<Vec<String>>,
    before: Vec<u8>,
    after: Vec<u8>,
    pub entries: Vec<Entry>,
}

impl Plan {
    pub fn prepare(root: &Path, pattern: Option<&str>) -> io::Result<Self> {
        Self::prepare_with(root, pattern, None)
    }

    pub fn prepare_selected(root: &Path, identities: &[String]) -> io::Result<Self> {
        Self::prepare_with(root, None, Some(identities.to_vec()))
    }

    fn prepare_with(
        root: &Path,
        pattern: Option<&str>,
        selected: Option<Vec<String>>,
    ) -> io::Result<Self> {
        let before = fs::read(root.join(".bitmap"))?;
        let mut bitmap = crate::recovery::jsonc::parse(&before)?;
        let rows = bitmap.as_object_mut().ok_or_else(|| invalid("soft reset bitmap"))?;
        if rows
            .get("$schema-version")
            .and_then(Value::as_str)
            .is_none()
        {
            return Err(invalid("soft reset bitmap schema"));
        }
        let entries = select(rows, pattern, selected.as_deref())?;
        let after = crate::inspection::render_bitmap(&bitmap)?;
        Ok(Self {
            root: root.to_owned(),
            pattern: pattern.map(str::to_owned),
            selected,
            before,
            after,
            entries,
        })
    }

    pub fn commit(&self, file_id: &str) -> io::Result<()> {
        let current =
            Self::prepare_with(&self.root, self.pattern.as_deref(), self.selected.clone())?;
        if current.before != self.before || current.after != self.after {
            return Err(invalid("soft reset bitmap changed"));
        }
        crate::reset_main::validate_file_id(file_id)?;
        crate::reset_main::backup_bitmap(&self.root, file_id)?;
        fs::write(self.root.join(".bitmap"), &self.after)
    }
}

fn select(
    rows: &mut serde_json::Map<String, Value>,
    pattern: Option<&str>,
    selected: Option<&[String]>,
) -> io::Result<Vec<Entry>> {
    let mut found = Vec::new();
    for (key, row) in rows.iter_mut() {
        if key.starts_with('$') || key == "_bit_lane" {
            continue;
        }
        let Some(version) = row["nextVersion"]["version"].as_str() else { continue };
        let identity = identity(row)?;
        if !matches(&identity, pattern, selected) {
            continue;
        }
        found.push(Entry { identity, version: version.to_owned() });
        row.as_object_mut()
            .ok_or_else(|| invalid("soft reset bitmap row"))?
            .shift_remove("nextVersion");
    }
    if invalid_selection_count(pattern, selected, found.len()) {
        return Err(invalid("soft reset identity absent or ambiguous"));
    }
    Ok(found)
}

fn identity(row: &Value) -> io::Result<String> {
    let name = row["name"].as_str().ok_or_else(|| invalid("soft reset name"))?;
    let scope = row["scope"]
        .as_str()
        .filter(|scope| !scope.is_empty())
        .or_else(|| row["defaultScope"].as_str())
        .ok_or_else(|| invalid("soft reset scope"))?;
    Ok(format!("{scope}/{name}"))
}

fn invalid(message: &str) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidData, message)
}

fn matches(identity: &str, pattern: Option<&str>, selected: Option<&[String]>) -> bool {
    pattern.is_none_or(|pattern| pattern == identity)
        && selected.is_none_or(|ids| ids.iter().any(|id| id == identity))
}

fn invalid_selection_count(
    pattern: Option<&str>,
    selected: Option<&[String]>,
    count: usize,
) -> bool {
    (pattern.is_some() && count != 1) || (selected.is_some() && count == 0)
}
