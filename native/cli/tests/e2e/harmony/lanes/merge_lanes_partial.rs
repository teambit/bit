//! `e2e/harmony/lanes/merge-lanes-partial.e2e.ts`.

use crate::helper::{Helper, parse, remote};

fn head_of_lane(helper: &Helper, lane: &str, name: &str) -> String {
    let lane_obj = parse(&helper.native(&format!("lane show {lane} --json")));
    lane_obj["components"]
        .as_array()
        .unwrap()
        .iter()
        .find(|comp| {
            comp["id"]["name"].as_str() == Some(name)
                || comp["id"]
                    .as_str()
                    .is_some_and(|id| id.ends_with(&format!("/{name}")))
        })
        .unwrap()["head"]
        .as_str()
        .unwrap()
        .to_owned()
}

fn model_head(helper: &Helper, id: &str) -> String {
    let log = parse(&helper.native(&format!("log {id} --json")));
    log.as_array().unwrap().last().unwrap()["hash"]
        .as_str()
        .unwrap()
        .to_owned()
}

/// merge lanes - partial merge functionality › partial merge › from a lane to main › with --include-deps › should not merge components that were not part of the patterns nor part of the pattern dependencies
/// merge lanes - partial merge functionality › partial merge › from a lane to main › with --include-deps › should merge components that merge the pattern
/// merge lanes - partial merge functionality › partial merge › from a lane to main › with --include-deps › should merge components that are dependencies of the given pattern
#[test]
fn partial_merge_from_a_lane_to_main_with_include_deps() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(3, true, "");
    helper.run("tag");
    remote::publish(&helper);
    helper.native("lane create dev");
    helper.populate_components(3, true, "version2");
    helper.run("snap");
    let comp1_head_on_lane = head_of_lane(&helper, "dev", "comp1");
    let comp2_head_on_lane = head_of_lane(&helper, "dev", "comp2");
    let comp3_head_on_lane = head_of_lane(&helper, "dev", "comp3");
    remote::publish(&helper);
    helper.native("switch main -x");

    let scope = helper.scopes.remote.clone();
    helper.native(&format!(
        "lane merge dev --pattern {scope}/comp2 --include-deps --skip-dependency-installation",
    ));
    assert_ne!(model_head(&helper, &format!("{scope}/comp1")), comp1_head_on_lane);
    assert_eq!(model_head(&helper, &format!("{scope}/comp2")), comp2_head_on_lane);
    assert_eq!(model_head(&helper, &format!("{scope}/comp3")), comp3_head_on_lane);
}

/// merge lanes - partial merge functionality › partial merge › from a lane to main › without --include-deps › should throw an error asking to enter --include-deps flag
#[test]
fn partial_merge_from_a_lane_to_main_without_include_deps() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(3, true, "");
    helper.run("tag");
    remote::publish(&helper);
    helper.native("lane create dev");
    helper.populate_components(3, true, "version2");
    helper.run("snap");
    remote::publish(&helper);
    helper.native("switch main -x");

    let scope = helper.scopes.remote.clone();
    let without_deps = helper.native_run(&format!(
        "lane merge dev --pattern {scope}/comp2 --skip-dependency-installation",
    ));
    assert!(!without_deps.status.success());
    let err_out = format!("{}{}", without_deps.stdout, without_deps.stderr);
    assert!(err_out.contains(r#"consider adding "--include-deps" flag"#), "{err_out}");
}
