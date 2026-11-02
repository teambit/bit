//! Unit tests for component tracking [`display`], [`relative`], and
//! [`diagnostic`] path formatting in `bit-object-import` path resolution ([`diagnostics_use_platform_paths_without_changing_stored_paths`]).

use super::{diagnostic, display, relative};
use std::path::Path;

/// Verifies that [`diagnostic`] and [`display`] render platform separators without mutating stored slash paths.
#[test]
fn diagnostics_use_platform_paths_without_changing_stored_paths() {
    let stored = "bar/nested/foo.js";
    let expected = ["bar", "nested", "foo.js"].join(std::path::MAIN_SEPARATOR_STR);
    assert_eq!(diagnostic(stored), expected);
    assert_eq!(display(Path::new("workspace"), &Path::new("workspace").join(stored)), expected);
    assert_eq!(stored, "bar/nested/foo.js");
}

/// Verifies that [`relative`] formats outside-workspace diagnostics using native platform path separators.
#[test]
fn outside_workspace_errors_keep_native_separators() {
    let parent = std::env::temp_dir();
    let root = parent.join("tracking-workspace");
    let target = parent.join("outside");
    let expected = Path::new("..").join("outside");
    assert_eq!(
        relative(&root, &target).unwrap_err().to_string(),
        format!(
            r#"error: file or directory "{}" is located outside of the workspace."#,
            expected.display(),
        ),
    );
}
