use super::fixture;
use crate::{commands::move_paths::support, helper::remote};
use std::fs;

#[test]
fn mixed_revert_keeps_the_existing_version_and_restores_historical_file_bytes() {
    let fixture = fixture::deleted(true);
    let version = fixture::version(&fixture.helper, "comp3");
    assert_ne!(version, fixture.original["comp3"]);
    fixture::successful(&fixture, "revert", true, false);
    fixture::assert_three(&fixture.helper);
    assert_eq!(fixture::version(&fixture.helper, "comp3"), version);
    for name in ["comp1", "comp2"] {
        assert_eq!(fixture::version(&fixture.helper, name), fixture.original[name]);
    }
    assert_eq!(
        fs::read_to_string(fixture.helper.scopes.local_path.join("comp3/index.js")).unwrap(),
        fixture::written_source("module.exports=()=> 'comp3';\n"),
    );
    // Continue the existing component; restored historical parents remain unchanged.
    support::setup(&fixture.helper, "snap comp3 --ignore-issues * --message restored");
    remote::publish(&fixture.helper);
    let status = support::json(&fixture.helper, "status --json");
    assert!(
        status["stagedComponents"]
            .as_array()
            .unwrap()
            .is_empty(),
    );
}

#[test]
fn local_new_lane_history_does_not_require_a_published_remote_lane() {
    let fixture = fixture::initial();
    support::setup(&fixture.helper, "lane create private-history");
    fixture.helper.append_file("comp3/index.js", "// private\n");
    support::setup(&fixture.helper, "snap --ignore-issues * --message private");
    let history = fixture::latest(&fixture.helper);
    fixture.helper.append_file("comp3/index.js", "// subsequent private snapshot\n");
    support::setup(&fixture.helper, "snap --ignore-issues * --message next-private");
    let fixture = fixture::Fixture { history, ..fixture };
    fixture::successful(&fixture, "checkout", false, false);
}
