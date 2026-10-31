//! Published `is-binary-path` uses binary-extensions 2.3.0, not source-byte heuristics.
const EXTENSIONS: &str = include_str!("binary_extensions.txt");

pub(super) fn note(file: &str) -> &'static str {
    let cleaned = file
        .trim()
        .trim_end_matches(['/', '\\']);
    let file_name = cleaned
        .rsplit(['/', '\\'])
        .next()
        .unwrap_or(cleaned);
    let extension = std::path::Path::new(file_name)
        .extension()
        .and_then(std::ffi::OsStr::to_str)
        .map_or("", |ext| ext.trim().trim_start_matches('.'));
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
