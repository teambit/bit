//! Unit tests for component directory move `.bitmap` projection ([`project`], [`Observed`]) and untracked
//! path errors in `bit-object-import` move operations ([`projected_roots_preserve_published_textual_prefix_matching`]).

use super::{Observed, project};
use serde_json::json;
/// Verifies that [`project::apply`] preserves Bit's textual prefix replacement behavior across `.bitmap` `rootDir` entries.
#[test]
fn projected_roots_preserve_published_textual_prefix_matching() {
    let root = std::env::temp_dir().join("bit-move-unit");
    let mut bitmap = json!({"foo":{"name":"foo","defaultScope":"scope","rootDir":"bar"},"other":{"name":"other","defaultScope":"scope","rootDir":"barista"}});
    let changes = project::apply(
        &root,
        &mut bitmap,
        &root.join("bar"),
        &root.join("next"),
        &mut Observed::default(),
    )
    .unwrap();
    assert_eq!(changes.len(), 2);
    assert_eq!(bitmap["other"]["rootDir"], "nextista");
    assert_eq!(changes[0]["changes"][0], json!({"from":"bar","to":"next"}));
}
/// Verifies that [`project::apply`] rejects untracked source paths in [`Observed`] without mutating `.bitmap`.
#[test]
fn untracked_paths_fail_without_mutating_bitmap() {
    let root = std::env::temp_dir();
    let mut bitmap = json!({"foo":{"name":"foo","defaultScope":"scope","rootDir":"bar"}});
    let before = bitmap.clone();
    assert!(
        project::apply(
            &root,
            &mut bitmap,
            &root.join("missing"),
            &root.join("next"),
            &mut Observed::default()
        )
        .is_err(),
    );
    assert_eq!(bitmap, before);
}
