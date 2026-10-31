use super::workspace;
use serde_json::{Value, json};

#[test]
fn workspace_policy_reorders_entries_preserves_comments_and_serializes_runtime_defaults() {
    let source = r#"// workspace sentinel
{
  "teambit.dependencies/dependency-resolver": {
    "policy": {
      "dependencies": {
        // keep package explanation
        "z-last": "^1.0.0"
      },
      "peerDependencies": { "peer": "^2.0.0" }
    }
  }
}"#;
    let output = workspace(
        source,
        json!({"z-last":"^1.0.0","a-first":"~3.0.0","peer":"^2.0.0"}).as_object().unwrap(),
    )
    .unwrap();
    assert!(output.contains("// workspace sentinel"));
    assert!(output.contains("// keep package explanation"));
    assert!(output.find("a-first").unwrap() < output.find("z-last").unwrap());
    let parsed = crate::recovery::jsonc::parse(output.as_bytes()).unwrap();
    assert_eq!(parsed[super::RESOLVER]["linkCoreAspects"], true);
    assert_eq!(parsed[super::RESOLVER]["policy"]["peerDependencies"], json!({}));
    assert!(output.ends_with('\n'));
    let mut config: Value = parsed;
    config[super::RESOLVER]["linkCoreAspects"] = json!(false);
    let output = workspace(&config.to_string(), &serde_json::Map::new()).unwrap();
    assert_eq!(
        crate::recovery::jsonc::parse(output.as_bytes()).unwrap()[super::RESOLVER]["linkCoreAspects"],
        false,
    );
}

#[test]
fn unchanged_workspace_dependency_write_still_records_the_complete_preimage() {
    let root = tempfile::tempdir().unwrap();
    std::fs::create_dir(root.path().join(".bit")).unwrap();
    let dependencies = serde_json::Map::new();
    let before = workspace("{}", &dependencies).unwrap();
    std::fs::write(root.path().join("workspace.jsonc"), &before).unwrap();
    super::write(root.path(), "workspace.jsonc", &dependencies, "2026-1-2-3-4-5").unwrap();
    assert_eq!(std::fs::read_to_string(root.path().join("workspace.jsonc")).unwrap(), before);
    assert_eq!(
        std::fs::read_to_string(
            root.path().join(".bit/workspace-config-history/files/2026-1-2-3-4-5"),
        )
        .unwrap(),
        before,
    );
    assert_eq!(
        std::fs::read_to_string(root.path().join(".bit/workspace-config-history/metadata.txt"))
            .unwrap(),
        "2026-1-2-3-4-5 Write dependencies\n",
    );
}
