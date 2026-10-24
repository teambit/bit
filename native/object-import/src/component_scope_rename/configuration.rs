//! WorkspaceConfig.write records the old bytes before changing the workspace default scope.
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
    let text = std::str::from_utf8(before).map_err(io::Error::other)?;
    let mut document = crate::jsonc::Document::parse(text)?;
    document.set(&[key, "defaultScope"], &serde_json::json!(scope));
    let _ = backup(root, before, scope, file_id);
    let bytes =
        crate::checkout::eol::normalize(format!("{document}\n").into_bytes(), cfg!(windows));
    fs::write(root.join("workspace.jsonc"), bytes)
}
fn backup(root: &Path, before: &[u8], scope: &str, file_id: &str) -> io::Result<()> {
    let directory = crate::scope_path(root).join("workspace-config-history");
    fs::create_dir_all(directory.join("files"))?;
    fs::write(directory.join("files").join(file_id), before)?;
    let mut metadata = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(directory.join("metadata.txt"))?;
    writeln!(metadata, "{file_id} default-scope ({scope})")
}
