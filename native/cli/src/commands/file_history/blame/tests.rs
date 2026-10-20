use super::published_source_key;

#[test]
fn published_windows_absolute_path_never_becomes_version_relative_path() {
    let key = published_source_key(r"D:\workspace\comp1", "D:/workspace/comp1/index.js");
    assert_eq!(key, "D:/workspace/comp1/index.js");
    assert_ne!(key, "index.js");
}

#[test]
fn published_posix_absolute_path_becomes_version_relative_path() {
    assert_eq!(published_source_key("/workspace/comp1", "/workspace/comp1/index.js"), "index.js");
}

#[test]
fn published_prefix_removal_preserves_repeated_prefix_in_nested_file() {
    assert_eq!(
        published_source_key("/workspace/comp1", "/workspace/comp1/a/workspace/comp1/index.js",),
        "a/workspace/comp1/index.js",
    );
}
