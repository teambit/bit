//! Unit tests for lane reset component model [`Selection`] ([`selection`], [`resetting_a_model_without_pending_state_does_not_create_state`]) and version state pruning via [`remove_versions`] in `bit-object-import`.

use super::remove_versions;
use crate::reset_lane::Selection;
use serde_json::json;

/// Builds a baseline [`Selection`] removing version `"a".repeat(40)` (`1.0.0`) with replacement `"b".repeat(40)`.
fn selection() -> Selection {
    let mut selection = Selection::new(vec!["a".repeat(40)], Some("b".repeat(40)), false);
    selection.labels = vec!["1.0.0".into()];
    selection
}

/// Verifies that [`remove_versions`] does not synthesize a `state` object when resetting a model that lacks one.
#[test]
fn resetting_a_model_without_pending_state_does_not_create_state() {
    let mut model = json!({"versions":{"1.0.0":"a".repeat(40)}});
    remove_versions(&mut model, &selection()).expect("reset versions");
    assert_eq!(model, json!({"versions":{}}));
}

/// Verifies that [`remove_versions`] omits an empty or null `state` field while retaining an existing empty `state.versions` map.
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

/// Verifies that [`remove_versions`] removes only the reset tag label from `state.versions` while preserving other pending entries.
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

/// Verifies that [`remove_versions`] retains an empty `state.versions` object when removing the final pending tag.
#[test]
fn removing_the_last_pending_version_retains_the_existing_versions_container() {
    let mut model =
        json!({"versions":{"1.0.0":"a".repeat(40)},"state":{"versions":{"1.0.0":{"local":true}}}});
    remove_versions(&mut model, &selection()).expect("reset final pending tag");
    assert_eq!(model, json!({"versions":{},"state":{"versions":{}}}));
}
