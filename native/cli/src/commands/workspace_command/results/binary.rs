//! Published `is-binary-path` uses binary-extensions 2.3.0, not source-byte heuristics.
const EXTENSIONS: &str = include_str!("binary_extensions.txt");

pub(super) fn note(file: &str) -> &'static str {
    let extension = std::path::Path::new(file)
        .extension()
        .and_then(std::ffi::OsStr::to_str)
        .unwrap_or_default()
        .to_lowercase();
    if EXTENSIONS
        .lines()
        .any(|candidate| candidate == extension)
    {
        "binary files cannot be merged. please pick the version to keep manually"
    } else {
        "git treats it as binary because one of its versions contains NUL bytes. the file is probably corrupted or saved as UTF-16. please fix it and merge manually"
    }
}
