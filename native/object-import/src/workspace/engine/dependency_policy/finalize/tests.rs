use super::{Request, apply};
use serde_json::{Value, json};

fn input() -> Value {
    json!({
        "state": {"entries": [], "packages": [{}, {}, {}], "components": [[], [], []]},
        "manual": [{}, {}, {}], "packageJson": [{}, {}, {}], "resolved": {},
        "selfIdentity": "sample.scope/widget@1.0.0",
        "environment": {"policy": {}, "workspace": {"dependencies": {}, "peerDependencies": {}},
            "modelComponents": [], "modelPackages": {}}
    })
}
fn finish(value: Value) -> Value {
    let request: Request = serde_json::from_value(value).unwrap();
    apply(&request).unwrap().1
}
#[test]
fn automatic_peers_follow_workspace_upgrades_and_keep_snap_versions_exact() {
    for (policy, installed, expected) in [
        ("^2.0.0", "1.0.0", "^2.0.0"),
        ("^2.0.0", "2.1.0", "^2.1.0"),
        ("*", "", "*"),
        ("", "0.0.0-abcdef", "0.0.0-abcdef"),
    ] {
        let mut value = input();
        value["state"]["packages"][2] = json!({"sample-peer": "+^"});
        value["environment"]["workspace"]["dependencies"] = json!({"sample-peer": policy});
        value["resolved"] =
            json!({"sample-peer": {"name": "sample-peer", "concreteVersion": installed}});
        let output = finish(value);
        assert_eq!(output["state"]["packages"][2]["sample-peer"], expected);
    }
}
#[test]
fn manual_plus_ranges_take_package_manifest_versions_and_missing_stays_missing() {
    let mut value = input();
    value["manual"][0] = json!({"sample-peer": "+~", "missing-peer": "+^"});
    value["packageJson"][1] = json!({"sample-peer": "2.3.4"});
    let output = finish(value);
    assert_eq!(output["state"]["packages"][0], json!({"sample-peer": "~2.3.4"}));
    assert_eq!(output["added"][0], json!(["sample-peer@~2.3.4"]));
    assert!(
        output["missing"]
            .as_array()
            .unwrap()
            .contains(&json!("missing-peer")),
    );
}
#[test]
fn environment_self_policy_prefers_installed_version_over_workspace_range() {
    let mut value = input();
    value["environment"]["policy"] = json!({"sample-peer": "+~"});
    value["environment"]["workspace"]["dependencies"] = json!({"sample-peer": "^2.0.0"});
    value["resolved"] = json!({"sample-peer": {"name": "sample-peer", "concreteVersion": "1.2.3"}});
    let output = finish(value);
    assert_eq!(output["state"]["packages"][0]["sample-peer"], "~1.2.3");
}
