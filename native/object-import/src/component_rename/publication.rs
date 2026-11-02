//! Canonical intermediate ([`initial`]) and final ([`final_bitmap`]) `.bitmap` writes and source-package retirement for component renames.
use super::{Plan, invalid};
use std::{fs, io, path::Path};

#[inline]
pub(super) fn initial(plan: &mut Plan, file_id: &str, reason: &str) -> io::Result<()> {
    write(&plan.root, &mut plan.controls.expected, &plan.controls.initial, file_id, reason)
}
#[inline]
pub(super) fn final_bitmap(plan: &mut Plan, file_id: &str) -> io::Result<()> {
    write(&plan.root, &mut plan.controls.expected, &plan.controls.bitmap, file_id, "rename")
}
fn write(
    root: &Path,
    expected: &mut Vec<u8>,
    bitmap: &serde_json::Value,
    file_id: &str,
    reason: &str,
) -> io::Result<()> {
    crate::component_remove::validate_file_id(file_id)?;
    let path = root.join(".bitmap");
    let metadata = fs::symlink_metadata(&path)?;
    if !metadata.is_file()
        || metadata.file_type().is_symlink()
        || u64::try_from(expected.len()).ok() != Some(metadata.len())
        || fs::read(&path)? != *expected
    {
        return Err(invalid("rename bitmap changed before publication"));
    }
    if crate::inspection::render_workspace_bitmap(bitmap)? == *expected {
        return Ok(());
    }
    crate::component_deprecation::write_bitmap(root, expected, bitmap, file_id, reason)?;
    *expected = fs::read(&path)?;
    Ok(())
}
pub(super) fn finish_original(
    plan: &mut Plan,
    file_id: &str,
    source_package: &str,
) -> io::Result<()> {
    let trimmed = source_package.trim();
    let package_path = Path::new(trimmed);
    if !trimmed.is_empty()
        && (trimmed.contains('\\')
            || package_path
                .components()
                .any(|part| !matches!(part, std::path::Component::Normal(_))))
    {
        return Err(invalid("rename source package path"));
    }
    let package: std::path::PathBuf = package_path.components().collect();
    if !package.as_os_str().is_empty()
        && (!plan.identity.exported || !plan.options.deprecate)
    {
        let relative = Path::new("node_modules").join(&package);
        if let Some(parent) = relative.parent() {
            crate::component_remove::validate_ancestors(&plan.root, parent)?;
        }
        remove(&plan.root.join(relative))?;
    }
    if !plan.identity.exported {
        return Ok(());
    }
    let reason = retirement_reason(plan);
    let mut bitmap = plan.controls.initial.clone();
    let (key, _) = super::identity::selected(&bitmap, &plan.identity.source)?;
    let key = key.to_owned();
    let (final_key, _) =
        super::identity::selected_any(&plan.controls.bitmap, &plan.identity.source)?;
    bitmap[&key] = plan.controls.bitmap[final_key].clone();
    write(&plan.root, &mut plan.controls.expected, &bitmap, file_id, &reason)?;
    if !plan.options.deprecate {
        remove(&plan.root.join(&plan.identity.source_directory))?;
    }
    Ok(())
}
#[inline]
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

#[inline]
fn retirement_reason(plan: &Plan) -> String {
    if plan.options.deprecate {
        format!("deprecate {}", plan.identity.source_id())
    } else {
        "delete".into()
    }
}
