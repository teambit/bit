use super::default_directory;
use std::fs;

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
