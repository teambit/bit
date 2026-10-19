//! A later partition never rolls back the successful existing-component revert.
use super::fixture;
use crate::{
    commands::{add::support::history_oracle, move_paths::support},
    harmony::lane_adoption::{callbacks::installation_fixture, output::durations},
    helper::{Helper, config, remote},
};
use serde_json::Value;
use std::{fs, path::PathBuf};

#[test]
fn corrupt_restored_source_fails_after_the_existing_component_revert_is_persisted() {
    let fixture = fixture::deleted(true);
    let before = fixture::version(&fixture.helper, "comp3");
    let paths = corrupt_source(&fixture);
    let variants = super::inflate_origin::qualified_errors(&fixture.helper);
    let result = support::compare_with_error_variants(
        &fixture.helper,
        &format!("lane revert {} --restore-deleted-components -x", fixture.history),
        durations,
        &variants,
    );
    assert!(!result.status.success());
    assert_existing_prefix(&fixture.helper, &before, "module.exports=()=> 'comp3';\n");
    for path in paths {
        assert_eq!(fs::read(path).unwrap(), b"invalid compressed phase-two Source");
    }
}

fn corrupt_source(fixture: &fixture::Fixture) -> [PathBuf; 2] {
    let version = fixture.original["comp1"].as_str().unwrap();
    let object = support::json(&fixture.helper, &format!("cat-component comp1@{version} --json"));
    let hash = object["files"]
        .as_array()
        .unwrap()
        .iter()
        .find(|row| row["relativePath"] == "index.js")
        .unwrap()["file"]
        .as_str()
        .unwrap();
    let scope = bit_object_import::scope_path(&fixture.helper.scopes.local_path);
    let paths = [scope, fixture.helper.scopes.remote_path.clone()].map(|scope| {
        scope
            .join("objects")
            .join(&hash[..2])
            .join(&hash[2..])
    });
    for path in &paths {
        assert!(path.is_file());
        fs::write(path, b"invalid compressed phase-two Source").unwrap();
    }
    paths
}

fn assert_existing_prefix(helper: &Helper, version: &Value, historical: &str) {
    assert_eq!(fixture::version(helper, "comp3"), *version);
    assert_eq!(
        fs::read_to_string(helper.scopes.local_path.join("comp3/index.js")).unwrap(),
        fixture::written_source(historical),
    );
}

fn provider_deleted() -> (Helper, String, Value) {
    let helper = installation_fixture();
    support::setup(&helper, "switch dev -x");
    helper.output_file("comp3/index.js", "module.exports='existing historical';\n");
    support::setup(&helper, "add comp3 -i comp3");
    config::set_component_env(&helper.scopes.local_path, "comp3", "teambit.harmony/empty-env");
    support::setup(&helper, "snap --unmodified --ignore-issues * --message existing");
    remote::publish(&helper);
    let history = fixture::latest(&helper);
    helper.output_file("comp3/index.js", "module.exports='existing newer';\n");
    support::setup(&helper, "snap --ignore-issues * --message newer");
    support::setup(&helper, "delete comp1 --silent --lane");
    support::setup(&helper, "snap --unmodified --ignore-issues * --message deleted");
    remote::publish(&helper);
    let version = fixture::version(&helper, "comp3");
    helper.output_file("lane-history-fail-load", "active");
    (helper, history, version)
}

#[test]
fn phase_two_onload_tooling_errors_are_owned_but_discarded_from_the_first_result() {
    let (helper, history, version) = provider_deleted();
    let result = history_oracle::compare(
        &helper,
        &format!("lane revert {history} --restore-deleted-components"),
        durations,
        ["checkout"],
        true,
    );
    assert!(result.status.success(), "{} {}", result.stdout, result.stderr);
    assert!(format!("{}{}", result.stdout, result.stderr).contains(
        "lane history actual onLoad failure"
    ),);
    assert!(!result.stdout.contains("Installation Error"));
    assert_existing_prefix(&helper, &version, "module.exports='existing historical';\n");
    let restored = support::bitmap(&helper);
    let target = restored
        .as_object()
        .unwrap()
        .values()
        .find(|row| row["name"] == "comp1")
        .unwrap();
    assert!(
        helper.scopes.local_path
            .join(target["rootDir"].as_str().unwrap())
            .join("index.js")
            .is_file(),
    );
}
