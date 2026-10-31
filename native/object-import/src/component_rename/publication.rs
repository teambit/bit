//! Canonical intermediate bitmap writes and source-package retirement.
use super::{Plan, invalid};
use std::{fs, io, path::Path};

pub(super) fn initial(plan: &mut Plan, file_id: &str, reason: &str) -> io::Result<()> {
    write(plan, &plan.controls.initial.clone(), file_id, reason)
}
pub(super) fn final_bitmap(plan: &mut Plan, file_id: &str) -> io::Result<()> {
    write(plan, &plan.controls.bitmap.clone(), file_id, "rename")
}
fn write(
    plan: &mut Plan,
    bitmap: &serde_json::Value,
    file_id: &str,
    reason: &str,
) -> io::Result<()> {
    if fs::read(plan.root.join(".bitmap"))? != plan.controls.expected {
        return Err(invalid("rename bitmap changed before publication"));
    }
    if crate::inspection::render_workspace_bitmap(bitmap)? == plan.controls.expected {
        return Ok(());
    }
    crate::component_deprecation::write_bitmap(
        &plan.root,
        &plan.controls.expected,
        bitmap,
        file_id,
        reason,
    )?;
    plan.controls.expected = fs::read(plan.root.join(".bitmap"))?;
    Ok(())
}
pub(super) fn finish_original(
    plan: &mut Plan,
    file_id: &str,
    source_package: &str,
) -> io::Result<()> {
    let package: std::path::PathBuf = Path::new(source_package).components().collect();
    if !plan.identity.exported || !plan.options.deprecate {
        remove(&plan.root.join("node_modules").join(package))?;
    }
    if !plan.identity.exported {
        return Ok(());
    }
    let reason = if plan.options.deprecate {
        format!("deprecate {}", plan.identity.source_id())
    } else {
        "delete".into()
    };
    let mut bitmap = plan.controls.initial.clone();
    let (key, _) = super::identity::selected(&bitmap, &plan.identity.source)?;
    let key = key.to_owned();
    let (final_key, _) =
        super::identity::selected_any(&plan.controls.bitmap, &plan.identity.source)?;
    bitmap[&key] = plan.controls.bitmap[final_key].clone();
    write(plan, &bitmap, file_id, &reason)?;
    if !plan.options.deprecate {
        remove(&plan.root.join(&plan.identity.source_directory))?;
    }
    Ok(())
}
fn remove(path: &Path) -> io::Result<()> {
    match fs::symlink_metadata(path) {
        Ok(metadata) if metadata.is_dir() && !metadata.file_type().is_symlink() => {
            fs::remove_dir_all(path)
        }
        Ok(_) => fs::remove_file(path),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error),
    }
}
