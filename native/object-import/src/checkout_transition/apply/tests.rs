
use super::error_path_for_platform;
#[test]
fn canonical_error_paths_preserve_nested_platform_separators() {
    assert_eq!(error_path_for_platform("nested/deep/file.ts", true), r"nested\deep\file.ts");
    assert_eq!(error_path_for_platform("nested/deep/file.ts", false), "nested/deep/file.ts");
}
