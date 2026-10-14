use super::{Material, plan};
use crate::workspace::engine::command::resolve_snapshot::{Participation, VersionState};
use serde_json::{Value, json};

fn material(identity: &str, automatic: bool, tags: &Value) -> Material {
    Material {
        identity: identity.into(),
        model: json!({"versions":tags}),
        version: json!({}),
        files: Vec::new(),
        version_state: VersionState { current_head: String::new(), tagged_version: None },
        pending: None,
        hidden: false,
        participation: Participation { selected: !automatic, automatic },
    }
}

#[test]
fn selected_major_and_automatic_patch_keep_separate_semantic_allocations() {
    let mut materials = [
        material("scope/selected", false, &json!({"1.2.3":"a"})),
        material("scope/dependent", true, &json!({"1.2.3":"b"})),
        material("scope/new", false, &json!({})),
    ];
    let params = json!({"releaseType":"major","incrementBy":1,"soft":false,"persist":false,"hasTagData":false});
    let grammar = json!({"1.2.3":{"canonicalText":"1.2.3","version":{"major":1,"minor":2,"patch":3,"prerelease":[]}}});
    plan(&mut materials, &params, &json!({}), &grammar).unwrap();
    assert_eq!(materials[0].version_state.tagged_version.as_deref(), Some("2.0.0"));
    assert_eq!(materials[1].version_state.tagged_version.as_deref(), Some("1.2.4"));
    assert_eq!(materials[2].version_state.tagged_version.as_deref(), Some("1.0.0"));
    assert_eq!(materials[0].model["versions"], json!({"1.2.3":"a"}));
}

#[test]
fn existing_exact_tag_declines_before_any_semantic_assignment() {
    let mut materials = [material("scope/selected", false, &json!({"1.2.3":"a"}))];
    let params = json!({"releaseType":"patch","incrementBy":1,"exactVersion":"1.2.3","soft":false,"persist":false,"hasTagData":false});
    let grammar = json!({"1.2.3":{"canonicalText":"1.2.3","version":{"major":1,"minor":2,"patch":3,"prerelease":[]}}});
    assert!(plan(&mut materials, &params, &json!({}), &grammar).is_err());
    assert!(materials[0].version_state.tagged_version.is_none());
}

#[test]
fn selected_automatic_report_overlap_keeps_selected_increment() {
    let mut linked = material("scope/new", true, &json!({}));
    linked.participation.selected = true;
    let mut materials = [linked, material("scope/automatic", true, &json!({}))];
    plan(&mut materials, &json!({"releaseType":"major","autoTagReleaseType":"minor","incrementBy":1,"soft":false,"persist":false,"hasTagData":false}), &json!({}), &json!({})).unwrap();
    assert_eq!(materials[0].version_state.tagged_version.as_deref(), Some("1.0.0"));
    assert_eq!(materials[1].version_state.tagged_version.as_deref(), Some("0.1.0"));
}

#[test]
fn tag_ranges_rewrite_only_same_batch_direct_dependencies() {
    let mut parent = material("scope/parent", true, &json!({}));
    parent.version = json!({"extensions":[{"name":"teambit.dependencies/dependency-resolver","data":{"componentRangePrefix":"~","dependencies":[{"id":"scope/leaf@1.0.0","versionRange":"~1.0.0"}]}}],
        "dependencies":[{"id":{"scope":"scope","name":"leaf","version":"1.0.0"},"versionRange":"^1.0.0"},{"id":{"scope":"scope","name":"outside","version":"1.0.0"},"versionRange":"^1.0.0"}]});
    let mut materials = [material("scope/leaf", false, &json!({"1.0.0":"a"})), parent];
    let grammar = json!({"1.0.0":{"canonicalText":"1.0.0","version":{"major":1,"minor":0,"patch":0,"prerelease":[]}}});
    plan(&mut materials, &json!({"releaseType":"major","incrementBy":1,"soft":false,"persist":false,"hasTagData":false}), &json!({}), &grammar).unwrap();
    assert_eq!(materials[1].version["dependencies"][0]["versionRange"], "~2.0.0");
    assert_eq!(materials[1].version["dependencies"][1]["versionRange"], "^1.0.0");
    assert_eq!(
        materials[1].version["extensions"][0]["data"]["dependencies"][0]["versionRange"],
        "~1.0.0",
    );
    materials[1].version["extensions"][0]["data"]["componentRangePrefix"] = json!("invalid");
    assert!(super::ranges::update(&mut materials).is_err());
}
