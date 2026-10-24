//! Revalidate the prepared reset and publish its Component, index and bitmap.

use super::{ObjectChange, Plan, invalid, repository::object_path};
use std::{
    fs,
    io::{self, Write},
    path::Path,
};

pub(super) fn commit(plan: &Plan, file_id: &str) -> io::Result<()> {
    validate_file_id(file_id)?;
    let fresh = Plan::prepare(
        &plan.input.root,
        &plan.input.identity,
        plan.input.head_only,
        plan.input.force,
    )?;
    if fresh.object != plan.object
        || fresh.bitmap != plan.bitmap
        || fresh.index != plan.index
        || fresh.history != plan.history
        || fresh.controls != plan.controls
    {
        return Err(invalid("reset workspace changed during preparation"));
    }
    write_object(&plan.input.root, &plan.object)?;
    if let Some(history) = &plan.history {
        write_object(&plan.input.root, history)?;
    }
    if let Some(index) = &plan.index {
        fs::write(plan.input.root.join(".bit/index.json"), &index.after)?;
    }
    crate::reset_lane::controls::publish(&plan.controls)?;
    backup_bitmap(&plan.input.root, file_id)?;
    fs::write(plan.input.root.join(".bitmap"), &plan.bitmap.after)
}

pub(super) fn write_object(root: &Path, object: &ObjectChange) -> io::Result<()> {
    let path = object_path(root, &object.hash);
    if let Some(bytes) = &object.after {
        fs::create_dir_all(path.parent().ok_or_else(|| invalid("reset object path"))?)?;
        fs::write(path, bytes)
    } else {
        fs::remove_file(path)
    }
}

pub(crate) fn backup_bitmap(root: &Path, file_id: &str) -> io::Result<()> {
    let directory = root.join(".bit/bitmap-history");
    fs::create_dir_all(&directory)?;
    fs::copy(root.join(".bitmap"), directory.join(format!(".bitmap-{file_id}")))?;
    let mut metadata = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(root.join(".bit/bitmap-history-metadata.txt"))?;
    writeln!(metadata, "{file_id} reset")
}

pub(crate) fn validate_file_id(file_id: &str) -> io::Result<()> {
    if file_id.len() > 32
        || file_id.split('-').count() != 6
        || file_id
            .split('-')
            .any(|part| part.is_empty() || !part.bytes().all(|byte| byte.is_ascii_digit()))
    {
        return Err(invalid("reset bitmap history receipt"));
    }
    Ok(())
}
