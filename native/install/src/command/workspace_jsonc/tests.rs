use super::edit;
use serde_json::json;
use std::fs;

#[test]
fn edits_keep_comments_and_back_up_the_previous_file() {
    let root = tempfile::tempdir().unwrap();
    let scope = root.path().join(".bit");
    let original = "{\n  // keep me\n  \"a\": 1\n}\n";
    fs::write(root.path().join("workspace.jsonc"), original).unwrap();
    edit(root.path(), &scope, "2026-1-2-3-4-5", "install", |document| {
        document.set(&["b"], &json!(2));
    })
    .unwrap();
    let written = fs::read_to_string(root.path().join("workspace.jsonc")).unwrap();
    assert_eq!(
        written,
        if cfg!(windows) {
            "{\r\n  // keep me\r\n  \"a\": 1,\r\n  \"b\": 2\r\n}\r\n"
        } else {
            "{\n  // keep me\n  \"a\": 1,\n  \"b\": 2\n}\n"
        },
    );
    assert!(written.contains("// keep me"));
    assert!(written.contains(r#""b": 2"#));
    let history = scope.join("workspace-config-history");
    assert_eq!(fs::read_to_string(history.join("files/2026-1-2-3-4-5")).unwrap(), original);
    assert_eq!(
        fs::read_to_string(history.join("metadata.txt")).unwrap(),
        "2026-1-2-3-4-5 install\n",
    );
}
