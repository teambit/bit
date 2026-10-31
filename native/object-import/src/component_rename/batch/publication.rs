use super::{Value, invalid};
use std::{fs, io, path::Path};
pub(super) fn merge(target: &mut Value, before: &Value, after: &Value) -> io::Result<()> {
    let original = before.as_object().ok_or_else(|| invalid("scope rename original controls"))?;
    let changed = after.as_object().ok_or_else(|| invalid("scope rename projected controls"))?;
    let target = target.as_object_mut().ok_or_else(|| invalid("scope rename target controls"))?;
    for key in original.keys() {
        if !changed.contains_key(key) {
            target.shift_remove(key);
        }
    }
    for (key, value) in changed {
        if original.get(key) == Some(value) {
            continue;
        }
        merge_entry(target, original.get(key), key, value)?;
    }
    Ok(())
}
fn merge_entry(
    target: &mut serde_json::Map<String, Value>,
    previous: Option<&Value>,
    key: &str,
    value: &Value,
) -> io::Result<()> {
    if let Some(previous) = previous.filter(|previous| previous.is_object() && value.is_object())
        && let Some(existing) = target.get_mut(key).filter(|val| val.is_object())
    {
        return merge(existing, previous, value);
    }
    target.insert(key.to_owned(), value.clone());
    Ok(())
}

pub(super) fn write(
    root: &Path,
    expected: &mut Vec<u8>,
    bitmap: &Value,
    file_id: &str,
    reason: &str,
) -> io::Result<()> {
    crate::component_remove::validate_file_id(file_id)?;
    let bitmap_path = root.join(".bitmap");
    let metadata = fs::symlink_metadata(&bitmap_path)?;
    if !metadata.is_file()
        || metadata.file_type().is_symlink()
        || fs::read(&bitmap_path)? != *expected
    {
        return Err(invalid("scope rename bitmap changed before publication"));
    }
    if crate::inspection::render_workspace_bitmap(bitmap)? == *expected {
        return Ok(());
    }
    crate::component_deprecation::write_bitmap(root, expected, bitmap, file_id, reason)?;
    *expected = fs::read(root.join(".bitmap"))?;
    Ok(())
}
