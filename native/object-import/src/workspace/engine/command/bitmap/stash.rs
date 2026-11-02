//! Stash restores authored entries ([`append`], [`Prepared`]) without assigning a detached snapshot hash to `.bitmap`.
//! Rejects workspace-root (`.`) additions and preserves non-overlapping relative `rootDir` paths.

use super::{Prepared, identity, invalid, lane, render_rows, rows};
use serde_json::Value;
use std::io;

/// Appends stashed new-component `.bitmap` entries into [`Prepared`] without assigning snapshot hashes.
pub(super) fn append(prepared: &mut Prepared, context: &Value) -> io::Result<()> {
    let bitmap = crate::parse_jsonc(&prepared.output)?;
    let mut rows = rows(&bitmap)?;
    let additions = context["stashAdditions"]
        .as_array()
        .filter(|items| items.len() <= 4096)
        .ok_or_else(|| invalid("stash bitmap additions"))?;
    for saved in additions {
        let root = saved["rootDir"]
            .as_str()
            .or_else(|| saved["directory"].as_str())
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .ok_or_else(|| invalid("stash bitmap root"))?;
        if !saved.is_object() {
            return Err(invalid("stash bitmap entry"));
        }
        let id = identity(saved)?;
        if rows
            .iter()
            .any(|row| identity(row).is_ok_and(|current| current == id))
        {
            continue;
        }
        crate::checkout::plan::relative_path(root)?;
        if root == "." {
            return Err(invalid("stash new workspace root"));
        }
        lane::validate_roots(root, &rows)?;
        let mut entry = saved.clone();
        let entry_map = entry.as_object_mut().expect("checked object");
        entry_map.shift_remove("stashVersion");
        entry_map.shift_remove("directory");
        entry_map.insert("rootDir".into(), Value::String(root.to_owned()));
        rows.push(entry);
        prepared.changed = true;
    }
    prepared.output =
        render_rows(rows, &bitmap["$schema-version"], lane::header(context, &bitmap)?)?;
    Ok(())
}
