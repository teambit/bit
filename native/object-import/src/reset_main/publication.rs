//! Revalidate the prepared reset and publish its Component, index and bitmap.

use super::{Plan, invalid, repository::object_path};
use std::{
    fs,
    io::{self, Write},
};

pub(super) fn commit(plan: &Plan, file_id: &str) -> io::Result<()> {
    validate_file_id(file_id)?;
    let fresh = Plan::prepare(
        &plan.input.root,
        &plan.input.identity,
        plan.input.head_only,
        plan.input.force,
    )?;
    if fresh.object != plan.object || fresh.bitmap != plan.bitmap || fresh.index != plan.index {
        return Err(invalid("reset workspace changed during preparation"));
    }
    write_object(plan)?;
    if let Some(index) = &plan.index {
        fs::write(plan.input.root.join(".bit/index.json"), &index.after)?;
    }
    backup_bitmap(plan, file_id)?;
    fs::write(plan.input.root.join(".bitmap"), &plan.bitmap.after)
}

fn write_object(plan: &Plan) -> io::Result<()> {
    let path = object_path(&plan.input.root, &plan.object.hash);
    if let Some(bytes) = &plan.object.after {
        fs::write(path, bytes)
    } else {
        fs::remove_file(path)
    }
}

fn backup_bitmap(plan: &Plan, file_id: &str) -> io::Result<()> {
    let directory = plan.input.root.join(".bit/bitmap-history");
    fs::create_dir_all(&directory)?;
    fs::copy(plan.input.root.join(".bitmap"), directory.join(format!(".bitmap-{file_id}")))?;
    let mut metadata = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(plan.input.root.join(".bit/bitmap-history-metadata.txt"))?;
    writeln!(metadata, "{file_id} reset")
}

fn validate_file_id(file_id: &str) -> io::Result<()> {
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
