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
        if !seen.insert(format!("{scope}/{name}")) {
            return Err(invalid("export duplicate bitmap identity"));
        }
        let row = rows.get_mut(name).ok_or_else(|| invalid("export bitmap row"))?;
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

fn promote_export_row(row: &mut Value, scope: &str, name: &str) -> io::Result<bool> {
    if row["name"] != name || row["version"].as_str().is_none_or(str::is_empty) {
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
