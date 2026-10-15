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
    before: Vec<u8>,
    after: Vec<u8>,
    pub entries: Vec<Entry>,
}

impl Plan {
    pub fn prepare(root: &Path, pattern: Option<&str>) -> io::Result<Self> {
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
        let entries = select(rows, pattern)?;
        let after = crate::inspection::render_bitmap(&bitmap)?;
        Ok(Self {
            root: root.to_owned(),
            pattern: pattern.map(str::to_owned),
            before,
            after,
            entries,
        })
    }

    pub fn commit(&self, file_id: &str) -> io::Result<()> {
        let current = Self::prepare(&self.root, self.pattern.as_deref())?;
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
) -> io::Result<Vec<Entry>> {
    let mut found = Vec::new();
    for (key, row) in rows.iter_mut() {
        if key.starts_with('$') || key == "_bit_lane" {
            continue;
        }
        let Some(version) = row["nextVersion"]["version"].as_str() else { continue };
        let identity = identity(row)?;
        if pattern.is_some_and(|pattern| pattern != identity) {
            continue;
        }
        found.push(Entry { identity, version: version.to_owned() });
        row.as_object_mut()
            .ok_or_else(|| invalid("soft reset bitmap row"))?
            .shift_remove("nextVersion");
    }
    if pattern.is_some() && found.len() != 1 {
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
