//! Candidate discovery must not validate replacement heads of unselected members.
use super::fixture;
use crate::{
    commands::{add::support::node, move_paths::support},
    helper::config,
};
use std::fs;

#[test]
fn selected_local_member_resets_while_unselected_inherited_member_has_no_replacement() {
    let helper = fixture::unknown_inherited();
    helper.output_file("comp2/index.js", "module.exports='selected local member';\n");
    support::setup(&helper, "add comp2 -i comp2");
    config::set_component_env(&helper.scopes.local_path, "comp2", "teambit.harmony/empty-env");
    fixture::snap(&helper, "comp2 --skip-auto-snap");
    let failure =
        support::prepare_history(&helper, || node(&helper.scopes.local_path, "reset --silent"));
    assert!(!failure.status.success());
    assert!(failure.stderr.contains("fatal: unable to find a new head"));
    let before = fixture::bitmap_row(&support::bitmap(&helper), "comp1");
    let head = fixture::head(&helper, "unrelated", "comp1");
    let objects = fixture::objects(&helper, std::slice::from_ref(&head));
    let files = fixture::sentinels(&helper);
    let selected = helper.scopes.local_path.join("comp2/index.js");
    let bytes = fs::read(&selected).unwrap();
    fixture::successful(&helper, "reset comp2 --silent");
    assert_eq!(fixture::bitmap_row(&support::bitmap(&helper), "comp1"), before);
    assert_eq!(fixture::head(&helper, "unrelated", "comp1"), head);
    assert_eq!(fixture::bitmap_row(&support::bitmap(&helper), "comp2")["version"], "");
    fixture::unchanged(&objects);
    fixture::unchanged(&files);
    assert_eq!(fs::read(selected).unwrap(), bytes);
}
