//! Published `is-binary-path` uses binary-extensions 2.3.0, not source-byte heuristics.
//!
//! [`note`] checks [`EXTENSIONS`] to return a binary-conflict guidance message for unmerged file paths.
/// Embedded list of binary file extensions from `binary-extensions` 2.3.0 (`binary_extensions.txt`) checked by [`note`].
const EXTENSIONS: &str = include_str!("binary_extensions.txt");

/// Returns the binary-conflict guidance message for `file` path based on whether its extension appears in [`EXTENSIONS`] (`binary-extensions` 2.3.0).
#[must_use]
#[inline]
pub(super) fn note(file: &str) -> &'static str {
    let file_name = file
        .trim()
        .trim_end_matches(['/', '\\'])
        .rsplit(['/', '\\'])
        .next()
        .unwrap_or_default();
    let extension = file_name
        .rsplit_once('.')
        .filter(|(stem, _)| !stem.is_empty())
        .map_or("", |(_, ext)| ext.trim().trim_start_matches('.'));
    if !extension.is_empty()
        && EXTENSIONS
            .lines()
            .any(|candidate| candidate.trim().eq_ignore_ascii_case(extension))
    {
        "binary files cannot be merged. please pick the version to keep manually"
    } else {
        "git treats it as binary because one of its versions contains NUL bytes. the file is probably corrupted or saved as UTF-16. please fix it and merge manually"
    }
}
