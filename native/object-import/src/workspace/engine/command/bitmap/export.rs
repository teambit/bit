//! Bitmap promotion for an acknowledged original-scope export.
use super::Prepared;
use crate::workspace::engine::invalid;
use serde_json::Value;
use std::{collections::HashSet, io, path::Path};

/// Promote every selected export row in one bitmap write and one history entry.
pub(in crate::workspace::engine::command) fn prepare_export_scopes(
    root: &Path,
    original: Vec<u8>,
    components: &[(String, String)],
) -> io::Result<Prepared> {
    let mut bitmap = crate::recovery::jsonc::parse(&original)?;
    let rows = bitmap.as_object_mut().ok_or_else(|| invalid("export bitmap object"))?;
    let mut seen = HashSet::new();
    let mut changed = false;
    for (scope, name) in components {
        let full = format!("{scope}/{name}");
        if !seen.insert(full.clone()) {
            return Err(invalid("export duplicate bitmap identity"));
        }
        let row =
            find_export_row(rows, &full, scope, name).ok_or_else(|| invalid("export bitmap row"))?;
        changed |= promote_export_row(row, scope, name)?;
    }
    let output =
        if changed { crate::inspection::render_bitmap(&bitmap)? } else { original.clone() };
    Ok(Prepared { root: root.to_owned(), original, output, changed })
}

impl Prepared {
    /// Resume may acknowledge only scopes that still had pending objects. Keep
    /// the original bitmap preimage while narrowing the rows to promote.
    pub(in crate::workspace::engine::command) fn select_export_promotions(
        &mut self,
        components: &[(String, String)],
    ) -> io::Result<()> {
        *self = prepare_export_scopes(&self.root, self.original.clone(), components)?;
        Ok(())
    }
}

fn find_export_row<'a>(
    rows: &'a mut serde_json::Map<String, Value>,
    full: &str,
    scope: &str,
    name: &str,
) -> Option<&'a mut Value> {
    let key = if rows.contains_key(full) {
        Some(full.to_owned())
    } else if rows.contains_key(name) {
        Some(name.to_owned())
    } else {
        rows.iter()
            .find(|(key, row)| export_row_matches(key, row, full, scope, name))
            .map(|(key, _)| key.clone())
    }?;
    rows.get_mut(&key)
}

fn export_row_matches(key: &str, row: &Value, full: &str, scope: &str, name: &str) -> bool {
    if matches!(key, "$schema-version" | "_bit_lane") || !row.is_object() {
        return false;
    }
    let base = key.split('@').next().unwrap_or(key);
    if base == full || base == name {
        return true;
    }
    let row_scope = row["scope"]
        .as_str()
        .filter(|val| !val.is_empty())
        .or_else(|| row["defaultScope"].as_str());
    row["name"].as_str() == Some(name) && row_scope == Some(scope)
}

fn promote_export_row(row: &mut Value, scope: &str, name: &str) -> io::Result<bool> {
    if row["name"]
        .as_str()
        .is_some_and(|row_name| row_name != name)
        || row["version"].as_str().is_none_or(str::is_empty)
    {
        return Err(invalid("export bitmap lifecycle"));
    }
    if row["scope"] == "" && row["defaultScope"] == scope {
        let fields = row.as_object_mut().ok_or_else(|| invalid("export bitmap entry"))?;
        fields.insert("scope".into(), Value::String(scope.to_owned()));
        fields.shift_remove("defaultScope");
        return Ok(true);
    }
    if row["scope"] != scope || !row["defaultScope"].is_null() {
        return Err(invalid("export bitmap lifecycle"));
    }
    Ok(false)
}
