use super::{admits, config_entries, to_config_object, update_config_policy};
use crate::{jsonc::Document, options::ExistingEntries};
use serde_json::json;

#[test]
fn added_entries_win_and_fields_are_sorted() {
    let mut entries = config_entries(&json!({
        "dependencies": { "zed": "1.0.0", "lodash": { "version": "4.0.0", "preserve": true } },
        "peerDependencies": { "react": "18" }
    }));
    entries.push((0, "zed".into(), json!("^2.0.0")));
    entries.push((0, "abc".into(), json!("^1.0.0")));
    let [dependencies, peers] = to_config_object(&entries);
    assert_eq!(
        serde_json::to_value(&dependencies).unwrap(),
        json!({ "abc": "^1.0.0", "lodash": { "version": "4.0.0", "preserve": true }, "zed": "^2.0.0" }),
    );
    assert_eq!(dependencies.keys().collect::<Vec<_>>(), ["abc", "lodash", "zed"]);
    assert_eq!(serde_json::to_value(&peers).unwrap(), json!({ "react": "18" }));
}

#[test]
fn creates_missing_fields_and_keeps_comments() {
    let text = r#"{
  "teambit.dependencies/dependency-resolver": {
    "policy": {
      "dependencies": {
        // pinned on purpose
        "zed": "1.0.0"
      }
    },
    "linkCoreAspects": true
  }
}"#;
    let mut document = Document::parse(text).unwrap();
    let entries =
        vec![(0, "zed".to_string(), json!("1.0.0")), (0, "abc".to_string(), json!("^1.0.0"))];
    update_config_policy(&mut document, &to_config_object(&entries));
    let written = format!("{document}");
    assert!(written.contains("// pinned on purpose"));
    let value = document.value();
    let policy = &value["teambit.dependencies/dependency-resolver"]["policy"];
    assert_eq!(policy["dependencies"], json!({ "abc": "^1.0.0", "zed": "1.0.0" }));
    assert_eq!(policy["peerDependencies"], json!({}));
}

#[test]
fn existing_entries_update_skip_or_fail_by_name_in_any_lifecycle() {
    let policy = config_entries(&json!({ "peerDependencies": { "react": "18" } }));
    assert!(admits(&policy, "react", ExistingEntries::Update).unwrap());
    assert!(!admits(&policy, "react", ExistingEntries::Skip).unwrap());
    let error = admits(&policy, "react", ExistingEntries::Fail).unwrap_err();
    assert_eq!(
        error.to_string(),
        "policy entry with react already exists, use install -u | --update-existing to update the entry",
    );
    assert!(admits(&policy, "lodash", ExistingEntries::Fail).unwrap());
}
