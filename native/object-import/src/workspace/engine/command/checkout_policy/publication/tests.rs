use super::Prepared;
use serde_json::json;
use std::{fs, path::PathBuf};

struct Fixture(PathBuf);
impl Fixture {
    fn new() -> Self {
        static NEXT: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
        let path = std::env::temp_dir()
            .join(format!(
                "bit-checkout-policy-{}-{}",
                std::process::id(),
                NEXT.fetch_add(1, std::sync::atomic::Ordering::Relaxed),
            ));
        fs::create_dir(&path).unwrap();
        Self(path)
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        fs::remove_dir_all(&self.0).unwrap();
    }
}

#[test]
fn policy_update_is_planned_and_preserves_unrelated_jsonc_comments() {
    let fixture = Fixture::new();
    let path = fixture.0.join("workspace.jsonc");
    let before = b"// keep this comment\n{\n  \"teambit.dependencies/dependency-resolver\": {\n    \"policy\": {\"dependencies\": {\"pkg\": \"^1.0.0\"}}\n  }\n}\n";
    fs::write(&path, before).unwrap();
    let mut prepared = Prepared::new(path.clone()).unwrap();
    let result = prepared
        .prepare(&json!({"updates":[["pkg","^1.0.0","^1.1.0"]],
        "conflicts":{},"logs":["pkg updated"],"hasDeps":true}))
        .unwrap()
        .unwrap();
    assert_eq!(result["workspaceDepsUpdates"]["pkg"], json!(["^1.0.0", "^1.1.0"]));
    assert_eq!(fs::read(&path).unwrap(), before);
    prepared.validate().unwrap();
    prepared.commit().unwrap();
    let after = fs::read_to_string(&path).unwrap();
    assert!(after.contains("// keep this comment"));
    assert!(after.contains(r#""pkg": "^1.1.0""#));
    assert!(after.contains(r#""peerDependencies": {}"#));
    assert!(after.contains(r#""linkCoreAspects": true"#));
}

#[test]
fn duplicate_policy_text_declines_before_any_workspace_write() {
    let fixture = Fixture::new();
    let path = fixture.0.join("workspace.jsonc");
    let before = br#"{"teambit.dependencies/dependency-resolver":{"policy":{"dependencies":{"pkg":"1.0.0"},"peerDependencies":{"pkg":"1.0.0"}}}}"#;
    fs::write(&path, before).unwrap();
    let mut prepared = Prepared::new(path.clone()).unwrap();
    assert!(
        prepared
            .prepare(&json!({"updates":[["pkg","1.0.0","2.0.0"]],
        "conflicts":{},"logs":[],"hasDeps":true}))
            .is_err(),
    );
    assert_eq!(fs::read(&path).unwrap(), before);
}

#[test]
fn policy_conflict_is_rendered_before_checkout_writes_the_workspace() {
    let fixture = Fixture::new();
    let path = fixture.0.join("workspace.jsonc");
    let before = br#"{"teambit.dependencies/dependency-resolver":{"policy":{"dependencies":{"pkg": "1.0.0"}}}}"#;
    fs::write(&path, before).unwrap();
    let mut prepared = Prepared::new(path.clone()).unwrap();
    let report = prepared
        .prepare(&json!({"updates":[],"conflicts":{"dependencies":[
        {"name":"pkg","version":"CONFLICT::1.0.0::2.0.0"}
    ]},"logs":["pkg - conflict. ours: 1.0.0, theirs: 2.0.0"],"hasDeps":true}))
        .unwrap()
        .unwrap();
    assert_eq!(report["workspaceDepsConflicts"]["dependencies"][0]["name"], "pkg");
    assert_eq!(fs::read(&path).unwrap(), before);
    prepared.commit().unwrap();
    let after = fs::read_to_string(&path).unwrap();
    assert!(after.contains("<<<<<<< ours"));
    assert!(after.contains("=======\n"));
    assert!(after.contains(">>>>>>> theirs"));
}

#[cfg(unix)]
#[test]
fn hardlinked_workspace_config_declines_during_validation() {
    let fixture = Fixture::new();
    let path = fixture.0.join("workspace.jsonc");
    let copy = fixture.0.join("other.jsonc");
    let before = br#"{"teambit.dependencies/dependency-resolver":{"policy":{"dependencies":{"pkg":"1.0.0"}}}}"#;
    fs::write(&path, before).unwrap();
    fs::hard_link(&path, &copy).unwrap();
    let mut prepared = Prepared::new(path.clone()).unwrap();
    prepared
        .prepare(&json!({"updates":[["pkg","1.0.0","2.0.0"]],
        "conflicts":{},"logs":[],"hasDeps":true}))
        .unwrap();
    assert!(prepared.validate().is_err());
    assert_eq!(fs::read(&path).unwrap(), before);
    assert_eq!(fs::read(&copy).unwrap(), before);
}

#[test]
fn policy_jsonc_writer_uses_platform_eols_independently_of_original_newlines() {
    let original = "// retained\n{\"teambit.dependencies/dependency-resolver\":{\"policy\":{\"dependencies\":{\"pkg\":\"1.0.0\"}}}}\n";
    let expected = concat!(
        "// retained\n{\n",
        "  \"teambit.dependencies/dependency-resolver\": {\n",
        "    \"policy\": {\n",
        "      \"dependencies\": {\n",
        "        \"pkg\": \"2.0.0\"\n",
        "      },\n",
        "      \"peerDependencies\": {}\n",
        "    },\n",
        "    \"linkCoreAspects\": true\n",
        "  }\n}\n",
    );
    let updates = json!({"pkg":["1.0.0","2.0.0"]});
    for input in [original.to_owned(), original.replace('\n', "\r\n")] {
        for windows in [false, true] {
            let actual =
                super::render_updates(&input, updates.as_object().unwrap(), windows).unwrap();
            let expected =
                if windows { expected.replace('\n', "\r\n") } else { expected.to_owned() };
            assert_eq!(actual, expected);
        }
    }
}
