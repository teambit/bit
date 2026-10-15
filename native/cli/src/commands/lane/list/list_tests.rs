use super::{LaneData, Tracking, lane, report};
use crate::commands::{color::Chalk, lane::show::show_report};
use serde_json::json;

fn row(schema: &str) -> serde_json::Value {
    json!({"hash": "h", "lane": {
        "name": "dev", "scope": "s", "schema": schema, "log": {"date": "1"},
        "components": [
            {"id": {"scope": "s", "name": "a"}, "head": "x"},
            {"id": {"scope": "s", "name": "b"}, "head": "y", "isDeleted": true},
        ],
    }})
}

#[test]
fn reads_a_lane_without_its_deleted_components() {
    let untracked = Tracking(Vec::new());
    let data = lane(&row("1.0.0"), &untracked).unwrap();
    assert_eq!(data.components, [json!({"id": "s/a", "head": "x"})]);
    assert_eq!(data.label(), "s/dev");
    let tracked = |local: &str| {
        Tracking(vec![json!({"localLane": local, "remoteLane": "dev", "remoteScope": "s"})])
    };
    let aliased = tracked("local-dev");
    assert_eq!(lane(&row("1.0.0"), &aliased).unwrap().label(), "s/dev (local-dev)");
    let same = tracked("dev");
    assert_eq!(lane(&row("1.0.0"), &same).unwrap().alias, None);
    assert!(lane(&row("0.0.0"), &untracked).is_err(), "Node migrates old lanes");
}

#[test]
fn reports_the_current_lane_and_the_others() {
    let main = LaneData {
        id: json!({"name": "main", "scope": "local"}),
        alias: None,
        components: vec![json!({}), json!({})],
        lane: None,
    };
    let dev = lane(&row("1.0.0"), &Tracking(Vec::new())).unwrap();
    let output =
        report(&[dev, main], &json!({"name": "main", "scope": "local"}), Chalk::new(false), false);
    assert_eq!(
        output,
        "current lane - main\n\navailable lanes (1)\n   \u{203A} s/dev (1 components)\n\nuse 'bit lane list --details' or 'bit lane show <lane-name>' for more info\nswitch lanes using 'bit switch <name>'. create lanes using 'bit lane create <name>'",
    );
}

#[test]
fn detailed_list_preserves_the_blank_line_after_an_empty_current_lane() {
    let main = LaneData {
        id: json!({"name": "main", "scope": "s"}),
        alias: None,
        components: Vec::new(),
        lane: None,
    };
    let dev = lane(&row("1.0.0"), &Tracking(Vec::new())).unwrap();
    let output =
        report(&[dev, main], &json!({"name": "main", "scope": "s"}), Chalk::new(false), true);
    assert!(output.starts_with("current lane - main\n\n\n> s/dev\ncomponents (1)\n"));
    assert!(output.ends_with(
        "switch lanes using 'bit switch <name>'. create lanes using 'bit lane create <name>'"
    ));
}

#[test]
fn shows_main_and_serializes_an_exported_lane() {
    let main = LaneData {
        id: json!({"name": "main", "scope": "s"}),
        alias: None,
        components: vec![json!({"id":"s/a@1.0.0","head":"1.0.0"})],
        lane: None,
    };
    assert_eq!(
        show_report(&main, Chalk::new(false)).unwrap(),
        "main\n\ncomponents (1)\n   › s/a@1.0.0 - 1.0.0",
    );
    let dev = lane(&row("1.0.0"), &Tracking(Vec::new())).unwrap();
    assert_eq!(dev.json()["components"], json!([{"id":"s/a","head":"x"}]));
    assert_eq!(dev.json()["remote"], "s/dev");
}
