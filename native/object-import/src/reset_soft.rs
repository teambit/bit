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
        Self::prepare_with(root, pattern.map(str::trim), None)
    }

    pub fn prepare_selected(root: &Path, identities: &[String]) -> io::Result<Self> {
        let selected = identities
            .iter()
            .map(|id| id.trim())
            .filter(|id| !id.is_empty())
            .map(str::to_owned)
            .collect();
        Self::prepare_with(root, None, Some(selected))
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
            .is_none_or(|version| version.trim().is_empty())
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
        if key.starts_with('$') || key == "_bit_lane" || key == "version" {
            continue;
        }
        let Some(version) = row["nextVersion"]["version"]
            .as_str()
            .map(str::trim)
            .filter(|version| !version.is_empty())
        else {
            continue;
        };
        let identity = identity(key, row)?;
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

fn identity(key: &str, row: &Value) -> io::Result<String> {
    let (row_scope, row_name) = crate::reset_lane::bitmap::row_identity(key, row);
    let scope = row_scope
        .map(str::trim)
        .filter(|scope| !scope.is_empty())
        .ok_or_else(|| invalid("soft reset scope"))?;
    let name = row_name.trim();
    if name.is_empty() {
        return Err(invalid("soft reset name"));
    }
    Ok(format!("{scope}/{name}"))
}

fn invalid(message: &str) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidData, message)
}

fn bare(value: &str) -> &str {
    let trimmed = value.trim();
    match trimmed.rsplit_once('@') {
        Some((base, _)) if !base.is_empty() => base.trim(),
        _ => trimmed,
    }
}

fn matches(identity: &str, pattern: Option<&str>, selected: Option<&[String]>) -> bool {
    pattern.is_none_or(|pattern| bare(pattern) == identity)
        && selected.is_none_or(|ids| {
            ids.iter()
                .any(|id| bare(id) == identity)
        })
}

fn invalid_selection_count(
    pattern: Option<&str>,
    selected: Option<&[String]>,
    count: usize,
) -> bool {
    (pattern.is_some() && count != 1) || (selected.is_some() && count == 0)
}
