use serde_json::json;

#[test]
fn cache_rekey_requires_same_file_classification_and_component_policy() {
    let current = json!({"mainFile":"index.js","bindingPrefix":"@scope","dependencies":[],
        "devDependencies":[],"packageDependencies":{},"devPackageDependencies":{},
        "peerPackageDependencies":{},"overrides":{},"extensions":[]});
    let mut target = current.clone();
    target["schema"] = json!("1.0.0");
    target["files"] = json!([{"relativePath":"index.js"}]);
    let files = vec!["index.js".into()];
    super::metadata(&current, &files, &target).unwrap();
    for (field, changed) in [
        ("files", json!([{"relativePath":"index.js"},{"relativePath":"added.test.js"}])),
        ("mainFile", json!("other.js")),
        (
            "extensions",
            json!([{"name":"teambit.envs/envs","config":{},"data":{"id":"custom/env"}}]),
        ),
        ("packageDependencies", json!({"changed":"1.0.0"})),
    ] {
        let mut changed_target = target.clone();
        changed_target[field] = changed;
        assert!(super::metadata(&current, &files, &changed_target).is_err());
    }
}
