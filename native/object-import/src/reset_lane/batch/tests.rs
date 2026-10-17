use super::Batch;
use crate::reset_lane::{Plan, object_hash, object_path, outbound};
use serde_json::{Value, json};
use std::{
    fs,
    path::Path,
    sync::atomic::{AtomicU64, Ordering},
};

static NEXT: AtomicU64 = AtomicU64::new(0);

fn object(root: &Path, hash: &str, kind: &str, value: &Value) {
    let path = object_path(&root.join(".bit/objects"), hash);
    fs::create_dir_all(path.parent().expect("parent")).expect("directory");
    fs::write(path, outbound::encode_object(hash, kind, value).expect("encode")).expect("object");
}

#[test]
fn publishes_two_lane_resets_once_and_checks_external_dependents() {
    let serial = NEXT.fetch_add(1, Ordering::Relaxed);
    let root =
        std::env::temp_dir().join(format!("bit-reset-lane-batch-{}-{serial}", std::process::id()));
    fs::create_dir_all(root.join(".bit/objects")).expect("scope");
    let lane_hash = object_hash("scope/work");
    let names = ["alpha", "beta"];
    let mains =
        ["1111111111111111111111111111111111111111", "2222222222222222222222222222222222222222"];
    let snaps =
        ["3333333333333333333333333333333333333333", "4444444444444444444444444444444444444444"];
    for index in 0..2 {
        let name = names[index];
        let identity = format!("scope/{name}");
        object(
            &root,
            &object_hash(&identity),
            "Component",
            &json!({
                "name":name,"scope":"scope","versions":{"1.0.0":mains[index]},
                "state":{"versions":{},"head":mains[index]},
            }),
        );
        object(&root, mains[index], "Version", &json!({"parents":[],"origin":{}}));
        let dependencies = if index == 1 {
            json!([{"id":{"scope":"scope","name":"alpha","version":snaps[0]}}])
        } else {
            json!([])
        };
        object(
            &root,
            snaps[index],
            "Version",
            &json!({
                "parents":[mains[index]],"origin":{"lane":{"scope":"scope","name":"work","hash":lane_hash}},
                "batchId":format!("batch-{name}"),"dependencies":dependencies,
            }),
        );
        object(
            &root,
            &object_hash(&format!("{identity}:VersionHistory")),
            "VersionHistory",
            &json!({
                "name":name,"scope":"scope","versions":[{"hash":mains[index],"parents":[]}],
                "graphCompleteRefs":[],
            }),
        );
    }
    object(
        &root,
        &lane_hash,
        "Lane",
        &json!({
            "name":"work","scope":"scope","components":[
                {"id":{"scope":"scope","name":"beta"},"head":snaps[1]},
                {"id":{"scope":"scope","name":"alpha"},"head":snaps[0]}],
        }),
    );
    let history_hash = object_hash(&format!("{lane_hash}:LaneHistory"));
    object(
        &root,
        &history_hash,
        "LaneHistory",
        &json!({
            "name":"work","scope":"scope","laneHash":lane_hash,
            "history":{"batch-alpha":{"components":[format!("scope/alpha@{}",snaps[0])]},
                "batch-beta":{"components":[format!("scope/beta@{}",snaps[1])]}}
        }),
    );
    fs::write(
        root.join(".bit/index.json"),
        serde_json::to_vec_pretty(&json!({
            "components":[
                {"id":{"scope":"scope","name":"alpha"},"hash":object_hash("scope/alpha")},
                {"id":{"scope":"scope","name":"beta"},"hash":object_hash("scope/beta")}],
            "lanes":[{"id":{"scope":"scope","name":"work"},"hash":lane_hash}],
        }))
        .expect("index"),
    )
    .expect("write index");
    fs::write(
        root.join(".bitmap"),
        crate::inspection::render_bitmap(&json!({
            "alpha":{"name":"alpha","scope":"","defaultScope":"scope","version":snaps[0],
                "mainFile":"index.js","rootDir":"alpha"},
            "beta":{"name":"beta","scope":"","defaultScope":"scope","version":snaps[1],
                "mainFile":"index.js","rootDir":"beta"},
            "$schema-version":"17.0.0",
            "_bit_lane":{"id":{"scope":"scope","name":"work"},"exported":false},
        }))
        .expect("bitmap"),
    )
    .expect("write bitmap");
    assert!(Plan::prepare(&root, "scope/alpha", false, false).is_err());
    let batch = Batch::prepare(&root, false).expect("batch");
    let stale = Batch::prepare(&root, false).expect("stale batch");
    assert_eq!(
        batch
            .results()
            .map(|(id, _)| id)
            .collect::<Vec<_>>(),
        vec!["scope/alpha", "scope/beta"],
    );
    batch.commit("2026-10-15-9-0-1").expect("commit");
    let lane = outbound::read_object(&root.join(".bit/objects"), &lane_hash, "Lane").expect("lane");
    assert_eq!(lane["components"], json!([]));
    let bitmap = crate::recovery::jsonc::parse(&fs::read(root.join(".bitmap")).expect("bitmap"))
        .expect("parse");
    assert_eq!(bitmap["alpha"]["version"], "1.0.0");
    assert_eq!(bitmap["beta"]["version"], "1.0.0");
    assert!(stale.commit("2026-10-15-9-0-2").is_err());
    let newcomer = "5555555555555555555555555555555555555555";
    let newcomer_hash = object_hash("scope/gamma");
    object(
        &root,
        &newcomer_hash,
        "Component",
        &json!({"name":"gamma","scope":"scope","versions":{}}),
    );
    object(
        &root,
        newcomer,
        "Version",
        &json!({"parents":[],"origin":{"lane":{"scope":"scope","name":"work","hash":lane_hash}},
            "batchId":"batch-gamma"}),
    );
    object(
        &root,
        &lane_hash,
        "Lane",
        &json!({"name":"work","scope":"scope","components":[
            {"id":{"scope":"scope","name":"gamma"},"head":newcomer}]}),
    );
    object(
        &root,
        &history_hash,
        "LaneHistory",
        &json!({"name":"work","scope":"scope","laneHash":lane_hash,
            "history":{"batch-gamma":{"components":[format!("scope/gamma@{newcomer}")]}}}),
    );
    let mut index: Value =
        serde_json::from_slice(&fs::read(root.join(".bit/index.json")).expect("index"))
            .expect("parse index");
    index["components"]
        .as_array_mut()
        .expect("components")
        .push(json!({"id":{"scope":"scope","name":"gamma"},"hash":newcomer_hash}));
    fs::write(root.join(".bit/index.json"), serde_json::to_vec_pretty(&index).expect("index"))
        .expect("write index");
    let mut bitmap =
        crate::recovery::jsonc::parse(&fs::read(root.join(".bitmap")).expect("bitmap"))
            .expect("parse bitmap");
    bitmap["gamma"] = json!({"name":"gamma","scope":"","defaultScope":"scope",
        "version":newcomer,"mainFile":"index.js","rootDir":"gamma",
        "onLanesOnly":true,"isAvailableOnCurrentLane":true});
    bitmap["_bit_lane"]["exported"] = json!(true);
    fs::write(root.join(".bitmap"), crate::inspection::render_bitmap(&bitmap).expect("bitmap"))
        .expect("write bitmap");
    fs::create_dir_all(root.join(".bit/refs/remotes/scope")).expect("refs directory");
    fs::write(root.join(".bit/refs/remotes/scope/work"), b"[]").expect("refs");
    Batch::prepare(&root, false)
        .expect("new component batch")
        .commit("2026-10-15-9-0-3")
        .expect("new component commit");
    assert!(!object_path(&root.join(".bit/objects"), &newcomer_hash).exists());
    let index: Value =
        serde_json::from_slice(&fs::read(root.join(".bit/index.json")).expect("index"))
            .expect("parse index");
    assert_eq!(
        index["components"]
            .as_array()
            .expect("components")
            .len(),
        2,
    );
    let bitmap = crate::recovery::jsonc::parse(&fs::read(root.join(".bitmap")).expect("bitmap"))
        .expect("parse bitmap");
    assert_eq!(bitmap["gamma"]["version"], "");
    assert!(bitmap["gamma"].get("onLanesOnly").is_none());
    assert!(bitmap["gamma"].get("isAvailableOnCurrentLane").is_none());
    let removed = "6666666666666666666666666666666666666666";
    object(
        &root,
        removed,
        "Version",
        &json!({"parents":[mains[0]],
        "origin":{"lane":{"scope":"scope","name":"work","hash":lane_hash}},
        "batchId":"batch-removed"}),
    );
    object(
        &root,
        &lane_hash,
        "Lane",
        &json!({"name":"work","scope":"scope",
        "components":[{"id":{"scope":"scope","name":"alpha"},"head":removed}]}),
    );
    object(
        &root,
        &history_hash,
        "LaneHistory",
        &json!({"name":"work","scope":"scope",
        "laneHash":lane_hash,"history":{"batch-removed":{"components":[format!("scope/alpha@{removed}")]}}}),
    );
    fs::write(
        root.join(".bit/refs/remotes/scope/work"),
        serde_json::to_vec(&json!([{"id":{"scope":"scope","name":"alpha"},"head":mains[0]}]))
            .expect("remote head"),
    )
    .expect("write remote head");
    let mut bitmap =
        crate::recovery::jsonc::parse(&fs::read(root.join(".bitmap")).expect("bitmap"))
            .expect("parse bitmap");
    bitmap
        .as_object_mut()
        .expect("bitmap rows")
        .shift_remove("alpha");
    fs::write(root.join(".bitmap"), crate::inspection::render_bitmap(&bitmap).expect("bitmap"))
        .expect("write bitmap");
    fs::create_dir_all(root.join(".bit/staged-config/scope")).expect("staged directory");
    fs::write(
        root.join(".bit/staged-config/scope/work.json"),
        serde_json::to_vec(&json!([{"id":{"scope":"scope","name":"alpha","version":removed},
            "componentMapObject":{"mainFile":"index.js","rootDir":"alpha",
                "isAvailableOnCurrentLane":true},
            "config":{"teambit.component/remove":{"removed":true,"__specific":true}}}]))
        .expect("staged config"),
    )
    .expect("write staged config");
    Batch::prepare(&root, false)
        .expect("removed component batch")
        .commit("2026-10-15-9-0-4")
        .expect("removed component commit");
    let bitmap = crate::recovery::jsonc::parse(&fs::read(root.join(".bitmap")).expect("bitmap"))
        .expect("parse bitmap");
    assert_eq!(bitmap["alpha"]["version"], "1.0.0");
    assert_eq!(bitmap["alpha"]["config"], json!({"teambit.component/remove":{"removed":true}}));
    let keys = bitmap
        .as_object()
        .expect("bitmap rows")
        .keys()
        .map(String::as_str)
        .collect::<Vec<_>>();
    assert_eq!(keys[..2], ["alpha", "beta"]);
    fs::remove_dir_all(root).expect("remove fixture");
}
