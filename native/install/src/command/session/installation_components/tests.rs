use super::ordered;
use crate::model::WorkspaceComponent;
use serde_json::json;
use std::path::Path;

fn component(name: &str) -> WorkspaceComponent {
    serde_json::from_value(json!({
        "id":{"scope":"scope","defaultScope":null,"name":name,"version":"1.0.0"},
        "rootDir":name,"dir":name,"files":["index.js"],"mainFile":"index.js",
        "packageName":format!("@scope/{name}"),"envId":"teambit.harmony/node",
        "isEnv":false,"hasPackageJson":false,"config":{},
    }))
    .expect("component fixture")
}

#[test]
fn actual_class_order_preserves_native_component_metadata() {
    let root = std::env::temp_dir();
    let rows = json!({"components":[
        {"id":"scope/provider@1.0.0","directory":root.join("provider")},
        {"id":"scope/comp@1.0.0","directory":root.join("comp")},
    ]});
    let result = ordered(&root, vec![component("comp"), component("provider")], &rows)
        .expect("validated class order");
    assert_eq!(result[0].id.name, "provider");
    assert_eq!(result[1].files, ["index.js"]);
}

#[test]
fn directory_receipt_rejects_duplicate_missing_and_changed_members() {
    let root = Path::new("/workspace");
    for rows in [
        json!([]),
        json!([{"id":"scope/comp@2.0.0","directory":"/workspace/comp"}]),
        json!([{"id":"scope/comp@1.0.0","directory":"/workspace/other"}]),
        json!([
            {"id":"scope/comp@1.0.0","directory":"/workspace/comp"},
            {"id":"scope/comp@1.0.0","directory":"/workspace/comp"},
        ]),
    ] {
        assert!(ordered(root, vec![component("comp")], &json!({"components":rows})).is_err());
    }
}
