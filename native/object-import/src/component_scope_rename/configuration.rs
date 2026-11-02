//! `WorkspaceConfig.write` backup and default-scope update ([`publish`]) for `workspace.jsonc`.
use std::{
    fs,
    io::{self, Write},
    path::Path,
};
pub(super) fn publish(
    root: &Path,
    before: &[u8],
    key: &str,
    scope: &str,
    file_id: &str,
) -> io::Result<()> {
    crate::component_remove::validate_file_id(file_id)?;
    let key = key.trim();
    let scope = scope.trim();
    let file_id = file_id.trim();
    let path = root.join("workspace.jsonc");
    let metadata = fs::symlink_metadata(&path)?;
    if !metadata.is_file()
        || metadata.file_type().is_symlink()
        || u64::try_from(before.len()).ok() != Some(metadata.len())
        || fs::read(&path)? != before
    {
        return Err(io::Error::other("scope rename workspace.jsonc target changed before write"));
    }
    let text = std::str::from_utf8(before).map_err(io::Error::other)?;
    let mut document = crate::jsonc::Document::parse(text)?;
    document.set(&[key, "defaultScope"], &serde_json::json!(scope));
    backup(root, before, scope, file_id)?;
    let bytes =
        crate::checkout::eol::normalize(format!("{document}\n").into_bytes(), cfg!(windows));
    fs::write(path, bytes)
}
#[inline]
fn backup(root: &Path, before: &[u8], scope: &str, file_id: &str) -> io::Result<()> {
    let directory = crate::scope_path(root).join("workspace-config-history");
    let files_dir = directory.join("files");
    fs::create_dir_all(&files_dir)?;
    fs::write(files_dir.join(file_id), before)?;
    let mut metadata = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(directory.join("metadata.txt"))?;
    writeln!(metadata, "{file_id} default-scope ({scope})")
}
