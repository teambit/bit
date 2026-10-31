use super::remove_versions;
use crate::reset_lane::Selection;
use serde_json::json;

fn selection() -> Selection {
    let mut selection = Selection::new(vec!["a".repeat(40)], Some("b".repeat(40)), false);
    selection.labels = vec!["1.0.0".into()];
    selection
}

#[test]
fn resetting_a_model_without_pending_state_does_not_create_state() {
    let mut model = json!({"versions":{"1.0.0":"a".repeat(40)}});
    remove_versions(&mut model, &selection()).expect("reset versions");
    assert_eq!(model, json!({"versions":{}}));
}

#[test]
fn empty_constructor_state_is_omitted_but_an_empty_versions_map_is_retained() {
    for state in [json!({}), json!(null)] {
        let mut model = json!({"versions":{},"state":state});
        remove_versions(&mut model, &selection()).expect("reset versions");
        assert_eq!(model, json!({"versions":{}}));
    }
    let mut model = json!({"versions":{},"state":{"versions":{}}});
    remove_versions(&mut model, &selection()).expect("reset versions");
    assert_eq!(model, json!({"versions":{},"state":{"versions":{}}}));
}

#[test]
fn pending_state_removes_only_the_published_tag_label_and_preserves_other_entries() {
    let hash = "a".repeat(40);
    let mut model = json!({"versions":{"1.0.0":hash,"2.0.0":"b".repeat(40)},"state":{"versions":{"1.0.0":{"local":true},hash.clone():{"local":true},"2.0.0":{"local":true}},"extra":true}});
    remove_versions(&mut model, &selection()).expect("reset tagged version");
    assert_eq!(model["versions"], json!({"2.0.0":"b".repeat(40)}));
    assert_eq!(
        model["state"],
        json!({"versions":{hash:{"local":true},"2.0.0":{"local":true}},"extra":true}),
    );
}

#[test]
fn removing_the_last_pending_version_retains_the_existing_versions_container() {
    let mut model =
        json!({"versions":{"1.0.0":"a".repeat(40)},"state":{"versions":{"1.0.0":{"local":true}}}});
    remove_versions(&mut model, &selection()).expect("reset final pending tag");
    assert_eq!(model, json!({"versions":{},"state":{"versions":{}}}));
}
