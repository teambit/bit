use super::prepare;
use serde_json::json;

#[test]
fn root_precedence_ranges_and_local_component_exclusion_preserve_order() {
    let facts = json!({
        "rootPolicy":{"entries":[{"dependencyId":"root","value":{"version":"^1.0.0"}}]},
        "variantPoliciesByPatterns":{"*":{"dependencies":{"other":"^1.2.0","root":"^9.0.0"}}},
        "componentPolicies":[{"policy":{"devDependencies":{"other":"^1.4.0","skip":"-"}}}],
        "components":[{"packageName":"local","dependencies":[
            {"name":"root","version":"10.0.0","lifecycleType":"runtime"},
            {"name":"local","version":"1.0.0","lifecycleType":"runtime"},
            {"name":"peer","version":"1.0.0","lifecycleType":"peer"},
            {"name":"model","version":"~2.0.0","lifecycleType":"dev"}
        ]}]
    });
    let result = prepare(&facts).unwrap();
    assert_eq!(
        result
            .keys()
            .map(String::as_str)
            .collect::<Vec<_>>(),
        ["root", "other", "model"],
    );
    assert_eq!(result["root"], "^1.0.0");
    assert_eq!(result["other"], "^1.4.0");
}

#[test]
fn object_values_lists_array_index_package_names_before_other_names() {
    let result = prepare(&json!({
        "rootPolicy":{"entries":[{"dependencyId":"ordinary","value":{"version":"1.0.0"}}]},
        "variantPoliciesByPatterns":{"*":{"dependencies":{"42":"1.0.0","7":"2.0.0","01":"3.0.0"}}},
        "componentPolicies":[],"components":[]
    }))
    .unwrap();
    assert_eq!(
        result
            .keys()
            .map(String::as_str)
            .collect::<Vec<_>>(),
        ["7", "42", "ordinary", "01"],
    );
}
