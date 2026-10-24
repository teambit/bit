use super::{directory, json};

#[test]
fn destination_matches_canonical_scope_owner_placeholders() {
    assert_eq!(directory(&json!({}), "owner.scope", "ui/button").unwrap(), "components/ui/button");
    assert_eq!(
        directory(&json!({"defaultDirectory":"{scopeId}/{name}"}), "owner.scope", "button")
            .unwrap(),
        "owner.scope/button",
    );
    assert_eq!(
        directory(&json!({"defaultDirectory":"{owner}/{scope}/{name}"}), "plain", "button")
            .unwrap(),
        "plain/button",
    );
    assert_eq!(
        directory(
            &json!({"defaultDirectory":"{owner}.{scope}/{name}"}),
            "owner.scope.extra",
            "button"
        )
        .unwrap(),
        "owner.scope/button",
    );
    assert_eq!(
        directory(&json!({"defaultDirectory":"packages"}), "owner.scope", "ui/button").unwrap(),
        "packages/ui/button",
    );
    assert!(directory(&json!({"defaultDirectory":"../{name}"}), "owner.scope", "button").is_err());
    assert!(
        directory(&json!({"defaultDirectory":"{unsupported}/{name}"}), "owner.scope", "button")
            .is_err(),
    );
}

#[test]
fn prospective_metadata_only_includes_genuinely_new_consumers() {
    let destinations = json!([
        {"scope":"scope","name":"new","version":"head","rootDir":"new","mainFile":"index.js"},
        {"scope":"scope","name":"inactive","version":"head","rootDir":"inactive","mainFile":"index.js"},
        {"scope":"scope","name":"existing-model","version":"head","rootDir":"model","mainFile":"index.js"}
    ]);
    let selected = json!([
        {"identity":"scope/new","currentIdPresent":false,"bitmapPresent":false},
        {"identity":"scope/inactive","currentIdPresent":true,"bitmapPresent":true},
        {"identity":"scope/existing-model","currentIdPresent":true,"bitmapPresent":false}
    ]);
    let actual = super::targets(destinations.as_array().unwrap(), selected.as_array().unwrap());
    assert_eq!(
        actual,
        vec![
            json!({"identity":"scope/new","version":"head","directory":"new","mainFile":"index.js","config":null,"packageJson":null})
        ],
    );
}

#[test]
fn inactive_default_scope_root_is_not_a_collision_with_itself() {
    let destination = json!({"scope":"scope","name":"component","rootDir":"existing-root"});
    let tracked =
        json!({"scope":"","defaultScope":"scope","name":"component","rootDir":"existing-root"});
    super::validate_overlap(&destination, std::iter::once(&tracked)).unwrap();
    let other =
        json!({"scope":"","defaultScope":"other","name":"component","rootDir":"existing-root"});
    assert!(super::validate_overlap(&destination, std::iter::once(&other)).is_err());
}

#[test]
fn workspace_default_scope_keeps_an_inactive_destination_out_of_collision_resolution() {
    let bitmap = json!({"inactive":{"scope":"","name":"component","rootDir":"existing-root"}});
    let projected =
        super::super::visibility::identity_bitmap(&bitmap, &json!({"defaultScope":"scope"}))
            .unwrap();
    let destination = json!({"scope":"scope","name":"component","rootDir":"existing-root"});
    super::validate_overlap(&destination, projected.as_object().unwrap().values()).unwrap();
}
