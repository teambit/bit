//! Stash restores authored entries without assigning the detached snapshot hash to bitmap.
use super::{Prepared, identity, invalid, lane, render_rows, rows};
use serde_json::Value;
use std::io;

pub(super) fn append(prepared: &mut Prepared, context: &Value) -> io::Result<()> {
    let bitmap = crate::parse_jsonc(&prepared.output)?;
    let mut rows = rows(&bitmap)?;
    let additions =
        context["stashAdditions"].as_array().ok_or_else(|| invalid("stash bitmap additions"))?;
    for saved in additions {
        let mut entry = saved.clone();
        entry
            .as_object_mut()
            .ok_or_else(|| invalid("stash bitmap entry"))?
            .shift_remove("stashVersion");
        let id = identity(&entry)?;
        if rows
            .iter()
            .any(|row| identity(row).is_ok_and(|current| current == id))
        {
            continue;
        }
        let root = entry["rootDir"]
            .as_str()
            .or_else(|| entry["directory"].as_str())
            .filter(|value| !value.is_empty())
            .ok_or_else(|| invalid("stash bitmap root"))?
            .to_owned();
        crate::checkout::plan::relative_path(&root)?;
        if root == "." {
            return Err(invalid("stash new workspace root"));
        }
        lane::validate_roots(&root, &rows)?;
        if entry["rootDir"].is_null() {
            entry["rootDir"] = Value::String(root);
        }
        rows.push(entry);
        prepared.changed = true;
    }
    prepared.output =
        render_rows(rows, &bitmap["$schema-version"], lane::header(context, &bitmap)?)?;
    Ok(())
}
