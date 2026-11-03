//! Revalidate the prepared reset ([`commit`], [`write_object`], [`backup_bitmap`], [`validate_file_id`], [`Plan`], [`ObjectChange`]) and publish its `Component`, `index.json`, and `.bitmap`.

use super::{ObjectChange, Plan, invalid, repository::object_path};
use std::{
    fs,
    io::{self, Write},
    path::Path,
};

/// Revalidates `plan` against disk and publishes its `Component`, `index.json`, and `.bitmap`.
pub(super) fn commit(plan: &Plan, file_id: &str) -> io::Result<()> {
    validate_file_id(file_id)?;
    let fresh = Plan::prepare(
        &plan.input.root,
        &plan.input.identity,
        plan.input.head_only,
        plan.input.force,
    )?;
    if !plan_inputs_unchanged(&fresh, plan) {
        return Err(invalid("reset workspace changed during preparation"));
    }
    write_object(&plan.input.root, &plan.object)?;
    if let Some(history) = &plan.history {
        write_object(&plan.input.root, history)?;
    }
    if let Some(index) = &plan.index {
        fs::write(crate::scope_path(&plan.input.root).join("index.json"), &index.after)?;
    }
    crate::reset_lane::controls::publish(&plan.controls)?;
    backup_bitmap(&plan.input.root, file_id)?;
    fs::write(plan.input.root.join(".bitmap"), &plan.bitmap.after)
}

/// Writes or deletes the scope loose object described by `object` under `root`.
pub(super) fn write_object(root: &Path, object: &ObjectChange) -> io::Result<()> {
    let path = object_path(root, &object.hash);
    if let Some(bytes) = &object.after {
        fs::create_dir_all(path.parent().ok_or_else(|| invalid("reset object path"))?)?;
        fs::write(path, bytes)
    } else {
        if path.is_symlink() {
            return Err(invalid("reset object symlink"));
        }
        match fs::remove_file(path) {
            Ok(()) => Ok(()),
            Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(()),
            Err(error) => Err(error),
        }
    }
}

/// Back up `.bitmap` into `.bit/bitmap-history/` before publishing a reset.
pub fn backup_bitmap(root: &Path, file_id: &str) -> io::Result<()> {
    let file_id = file_id.trim();
    validate_file_id(file_id)?;
    let scope_dir = crate::scope_path(root);
    let directory = scope_dir.join("bitmap-history");
    let metadata_path = scope_dir.join("bitmap-history-metadata.txt");
    if directory.is_symlink() || metadata_path.is_symlink() {
        return Err(invalid("reset bitmap history symlink"));
    }
    fs::create_dir_all(&directory)?;
    fs::copy(root.join(".bitmap"), directory.join(format!(".bitmap-{file_id}")))?;
    let mut metadata = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(metadata_path)?;
    writeln!(metadata, "{file_id} reset")
}

/// Validates that `file_id` matches the six-segment numeric `.bitmap-<file_id>` timestamp format.
pub(crate) fn validate_file_id(file_id: &str) -> io::Result<()> {
    let file_id = file_id.trim();
    if file_id.len() > 32 {
        return Err(invalid("reset bitmap history receipt"));
    }
    let mut parts = file_id.split('-');
    for _ in 0..6 {
        if !parts
            .next()
            .is_some_and(|part| !part.is_empty() && part.bytes().all(|byte| byte.is_ascii_digit()))
        {
            return Err(invalid("reset bitmap history receipt"));
        }
    }
    if parts.next().is_some() {
        return Err(invalid("reset bitmap history receipt"));
    }
    Ok(())
}

/// Returns `true` when every projected object, index, `.bitmap`, and control file in `fresh` matches `plan`.
#[inline]
fn plan_inputs_unchanged(fresh: &Plan, plan: &Plan) -> bool {
    fresh.object == plan.object
        && fresh.bitmap == plan.bitmap
        && fresh.index == plan.index
        && fresh.history == plan.history
        && fresh.controls == plan.controls
}
