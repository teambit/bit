use super::Prepared;
use serde_json::json;

#[test]
fn tracked_lane_component_with_a_main_head_loses_lane_only_flags() {
    let original = serde_json::to_vec(&json!({
        "s/a":{"name":"a","scope":"s","version":"lane-head","mainFile":"index.js",
            "rootDir":"a","onLanesOnly":true,"isAvailableOnCurrentLane":true},
        "$schema-version":"17.0.0",
        "_bit_lane":{"id":{"name":"dev","scope":"s"},"exported":true},
    }))
    .unwrap();
    let mut prepared = Prepared {
        root: std::path::PathBuf::new(),
        original: original.clone(),
        output: original,
        changed: false,
    };
    let context = json!({
        "models":[{"name":"a","scope":"s","head":"main-head"}],
        "lane":{"switchId":{"name":"main","scope":"s"},"switchLaneOnly":["s/a"],
            "switchLaneHeads":{},"switchExported":true},
    });
    prepared.switch_lane(&context).unwrap();
    let bitmap = crate::recovery::jsonc::parse(&prepared.output).unwrap();
    assert_eq!(bitmap["a"]["version"], "lane-head");
    assert!(bitmap["a"].get("onLanesOnly").is_none());
    assert!(bitmap["a"].get("isAvailableOnCurrentLane").is_none());
    assert!(bitmap.get("_bit_lane").is_none());
}

#[test]
fn tracked_lane_component_keeps_lane_only_flags_on_another_lane() {
    let original = serde_json::to_vec(&json!({
        "s/a":{"name":"a","scope":"s","version":"lane-head","mainFile":"index.js",
            "rootDir":"a","onLanesOnly":true,"isAvailableOnCurrentLane":true},
        "$schema-version":"17.0.0",
        "_bit_lane":{"id":{"name":"dev","scope":"s"},"exported":true},
    }))
    .unwrap();
    let mut prepared = Prepared {
        root: std::path::PathBuf::new(),
        original: original.clone(),
        output: original,
        changed: false,
    };
    let context = json!({
        "models":[{"name":"a","scope":"s","head":"main-head"}],
        "lane":{"switchId":{"name":"study","scope":"s"},"switchLaneOnly":["s/a"],
            "switchLaneHeads":{"s/a":"lane-head"},"switchExported":true},
    });
    prepared.switch_lane(&context).unwrap();
    let bitmap = crate::recovery::jsonc::parse(&prepared.output).unwrap();
    assert_eq!(bitmap["a"]["version"], "lane-head");
    assert_eq!(bitmap["a"]["onLanesOnly"], true);
    assert_eq!(bitmap["a"]["isAvailableOnCurrentLane"], true);
    assert_eq!(bitmap["_bit_lane"]["id"]["name"], "study");
}
