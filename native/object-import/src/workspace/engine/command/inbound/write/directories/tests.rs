//! Unit tests for default component directory template resolution via [`default_directory`] ([`absent_template_uses_the_legacy_consumer_default_without_harmony`]) in `bit-object-import`.
//!
//! Checks legacy consumer default directories (`components/{name}`) and custom `defaultDirectory` templates in `workspace.jsonc` via [`default_directory`].

use super::default_directory;
use std::fs;

/// Verifies that [`default_directory`] falls back to `components/{name}` when unset and appends `/{name}` to custom `workspace.jsonc` templates.
#[test]
fn absent_template_uses_the_legacy_consumer_default_without_harmony() {
    let root = tempfile::tempdir().unwrap();
    fs::create_dir_all(root.path().join(".bit/objects")).unwrap();
    fs::write(
        root.path().join(".bit/scope.json"),
        br#"{"name":"local","lanes":{"current":"main"}}"#,
    )
    .unwrap();
    fs::write(
        root.path().join("workspace.jsonc"),
        br#"{"teambit.workspace/workspace":{"defaultScope":"scope"}}"#,
    )
    .unwrap();
    assert_eq!(default_directory(root.path()).unwrap(), "components/{name}");
    fs::write(
        root.path().join("workspace.jsonc"),
        br#"{"teambit.workspace/workspace":{"defaultScope":"scope","defaultDirectory":"custom"}}"#,
    )
    .unwrap();
    assert_eq!(default_directory(root.path()).unwrap(), "custom/{name}");
}
