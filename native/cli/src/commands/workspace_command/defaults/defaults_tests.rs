//! Unit tests for `.bit-app` file detection ([`app_file`]) and default dev-file receipt construction in workspace commands.
//!
//! Verifies `.bit-app.*` / `.*-app.*` filename suffixes in [`app_file`] and default [`policy`] receipt structures.

use super::app_file;

/// Verifies [`app_file`] recognizes `.bit-app.*` and `.*-app.*` filenames and rejects bare suffixes.
///
/// Checks `.bit-app.ts`, `.react-app.tsx`, `.node-app.js`, and non-app source paths.
#[test]
fn app_files() {
    assert!(app_file("src/my.bit-app.ts"));
    assert!(app_file("x.react-app.tsx"));
    assert!(app_file("nested/app.node-app.js"));
    assert!(!app_file("x.react-app."));
    assert!(!app_file("x.bit-app./index.ts"));
    assert!(!app_file("index.ts"));
}

/// Builds a minimal component dependency [`crate::commands::status::policy::Policy`] with a `^` range prefix.
fn policy() -> crate::commands::status::policy::Policy {
    crate::commands::status::policy::Policy {
        merge_conflict: false,
        input: serde_json::json!({ "resolution": { "prefix": "^" } }),
        extensions: Vec::new(),
        model_packages: Default::default(),
        overrides: serde_json::Value::Null,
        binding_prefix: String::new(),
        package_name: String::new(),
    }
}

/// Verifies default dev-file grouping for `.spec.ts` files with [`policy`] and decline on `.docs.mdx` or `.node-app.ts` files.
///
/// Ensures components with callback-requiring docs or app files decline fast-path receipt generation.
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
