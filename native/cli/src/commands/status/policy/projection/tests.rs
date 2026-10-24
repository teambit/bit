use serde_json::{Value, json};

const RESOLVER: &str = "teambit.dependencies/dependency-resolver";

fn target() -> Value {
    json!({"identity":"scope/ui/button","directory":"comps/ui/button","version":"1.0.0"})
}

#[test]
fn origin_precedence_matches_aspects_merger() {
    let mut target = target();
    target["componentConfig"] = json!({RESOLVER:{"policy":{"dependencies":{"bitmap":"1"}}}});
    target["config"] =
        json!({"propagate":true,"extensions":{RESOLVER:{"policy":{"dependencies":{"file":"2"}}}}});
    let context = json!({"targets":[&target],"workspace":{"teambit.workspace/variants":{"*":{RESOLVER:{"policy":{"dependencies":{"variant":"3"}}}}}}});
    let version = json!({"extensions":[{"name":RESOLVER,"config":{"__specific":true,"policy":{"dependencies":{"stored":"4"}}}}]});
    let rows = super::extensions(&context, &target, Some(&version)).unwrap();
    assert_eq!(
        rows[0]["config"],
        json!({"policy":{"dependencies":{"bitmap":"1"}},"__specific":true}),
    );
    target
        .as_object_mut()
        .unwrap()
        .remove("componentConfig");
    let rows = super::extensions(&context, &target, Some(&version)).unwrap();
    assert_eq!(
        rows[0]["config"],
        json!({"policy":{"dependencies":{"file":"2"}},"__specific":true}),
    );
}

#[test]
fn variant_specificity_exclusions_and_propagation_share_installer_rules() {
    let target = target();
    let context = json!({"targets":[&target],"workspace":{"teambit.workspace/variants":{
        "*":{RESOLVER:{"policy":{"dependencies":{"global":"1"}}}},
        "comps/ui":{RESOLVER:{"policy":{"dependencies":{"directory":"2"}}},"propagate":false},
        "comps/ui, !comps/ui/excluded":{"teambit.pkg/pkg":{"packageJson":{"name":"@custom/{name}"}}},
        "{ui/**}":{RESOLVER:{"policy":{"dependencies":{"namespace":"3"}}}}
    }}});
    let rows = super::extensions(&context, &target, None).unwrap();
    assert_eq!(rows.len(), 2);
    assert_eq!(rows[0]["name"], "teambit.pkg/pkg");
    assert_eq!(rows[1]["config"]["policy"]["dependencies"], json!({"directory":"2"}));
}
