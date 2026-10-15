use super::app_file;

#[test]
fn app_files() {
    assert!(app_file("src/my.bit-app.ts"));
    assert!(app_file("x.react-app.tsx"));
    assert!(!app_file("x.react-app."));
    assert!(!app_file("x.bit-app./index.ts"));
    assert!(!app_file("index.ts"));
}

fn policy() -> crate::commands::status::policy::Policy {
    crate::commands::status::policy::Policy {
        input: serde_json::json!({ "resolution": { "prefix": "^" } }),
        extensions: Vec::new(),
        model_packages: Default::default(),
        overrides: serde_json::Value::Null,
        binding_prefix: String::new(),
        package_name: String::new(),
    }
}

#[test]
fn receipt_groups_test_files_and_declines_callback_files() {
    let target = serde_json::json!({ "identity": "remote/one" });
    let files = ["index.ts".to_string(), "index.spec.ts".to_string()];
    let receipt = super::receipt(&target, &policy(), &files).unwrap();
    assert_eq!(
        receipt["devFiles"]["teambit.defender/tester"],
        serde_json::json!(["index.spec.ts"]),
    );
    assert_eq!(receipt["componentRangePrefix"], "^");
    let docs = ["index.ts".to_string(), "one.docs.mdx".to_string()];
    assert!(super::receipt(&target, &policy(), &docs).is_err());
    let app = ["my.node-app.ts".to_string()];
    assert!(super::receipt(&target, &policy(), &app).is_err());
    let env = serde_json::json!({ "identity": "teambit.harmony/node" });
    assert!(super::receipt(&env, &policy(), &files).is_err());
}
