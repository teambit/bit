use super::{Material, Participation, VersionState, object};
use serde_json::json;

#[test]
fn tag_model_keeps_object_identity_distinct_from_semantic_identity() {
    let old = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    let new = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    let material = Material {
        identity: "scope/component".into(),
        model: json!({"scope":"scope","name":"component","versions":{"1.0.0":old},
            "orphanedVersions":{"1.1.0":old,"9.0.0":old},"head":old,"state":{"versions":{"1.0.0":{"local":true}}}}),
        version: json!({}),
        files: Vec::new(),
        version_state: VersionState {
            current_head: old.into(),
            tagged_version: Some("1.1.0".into()),
        },
        pending: None,
        hidden: false,
        participation: Participation { selected: true, automatic: false },
    };
    let model = object::local_model(&material, new).unwrap();
    assert_eq!(model["head"], new);
    assert_eq!(model["versions"]["1.0.0"], old);
    assert_eq!(model["versions"]["1.1.0"], new);
    assert!(model["orphanedVersions"].get("1.1.0").is_none());
    assert_eq!(model["orphanedVersions"]["9.0.0"], old);
    assert_eq!(material.model["orphanedVersions"]["1.1.0"], old);
    assert_eq!(model["state"]["versions"]["1.1.0"]["local"], true);
    assert!(model["state"]["versions"].get(new).is_none());
    let duplicate = Material { model, ..material };
    assert!(object::local_model(&duplicate, new).is_err());
}
