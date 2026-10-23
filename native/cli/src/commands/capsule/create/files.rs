//! Source and package files for an isolated workspace component.

use bit_install::workspace::BitmapEntry;
use serde_json::json;
use std::{fs, io, path::Path};

pub(super) fn write_default_package_json(
    capsule_dir: &Path,
    entry: &BitmapEntry,
) -> io::Result<()> {
    let pkg_json_path = capsule_dir.join("package.json");
    if pkg_json_path.exists() {
        return Ok(());
    }
    let scope = entry.id.scope.as_deref().unwrap_or("my-scope");
    let pkg_name = format!("@{scope}/{}", entry.id.name.replace('/', "."));
    let ver = entry.id.version.as_deref().unwrap_or("0.0.1");
    let pkg = json!({
        "name": pkg_name,
        "version": ver,
        "main": entry.main_file,
    });
    fs::write(&pkg_json_path, serde_json::to_string_pretty(&pkg)?)
}

pub(super) fn copy_component_files(src: &Path, dst: &Path) -> io::Result<()> {
    fs::create_dir_all(dst)?;
    for entry in fs::read_dir(src)?.filter_map(Result::ok) {
        let name = entry.file_name();
        if name == "node_modules" || name == ".git" {
            continue;
        }
        let src_path = entry.path();
        let dst_path = dst.join(&name);
        if src_path.is_dir() {
            copy_component_files(&src_path, &dst_path)?;
        } else if src_path.is_file() {
            fs::copy(&src_path, &dst_path)?;
        }
    }
    Ok(())
}
