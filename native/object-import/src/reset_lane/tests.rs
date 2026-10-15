use super::{Plan, object_hash, object_path};
use crate::workspace::engine::command::outbound;
use serde_json::{Value, json};
use std::{
    fs,
    path::Path,
    sync::atomic::{AtomicU64, Ordering},
};

static NEXT: AtomicU64 = AtomicU64::new(0);

fn write_object(root: &Path, hash: &str, kind: &str, value: &Value) {
    let path = object_path(&root.join(".bit/objects"), hash);
    fs::create_dir_all(path.parent().expect("parent")).expect("directory");
    fs::write(path, outbound::encode_object(hash, kind, value).expect("encode")).expect("object");
}

#[test]
fn resets_linear_lane_snaps_and_refuses_stale_publication() {
    let serial = NEXT.fetch_add(1, Ordering::Relaxed);
    let root =
        std::env::temp_dir().join(format!("bit-reset-lane-test-{}-{serial}", std::process::id()));
    fs::create_dir_all(root.join(".bit/objects")).expect("scope");
    let identity = "scope/alpha";
    let component_hash = object_hash(identity);
    let lane_hash = object_hash("scope/work");
    let main = "1111111111111111111111111111111111111111";
    let first = "2222222222222222222222222222222222222222";
    let second = "3333333333333333333333333333333333333333";
    write_object(
        &root,
        &component_hash,
        "Component",
        &json!({
            "name":"alpha","scope":"scope","versions":{"1.0.0":main},
            "state":{"versions":{},"head":main},
        }),
    );
    for (hash, parent, batch, lane) in [
        (main, None, None, false),
        (first, Some(main), Some("batch-one"), true),
        (second, Some(first), Some("batch-two"), true),
    ] {
        write_object(
            &root,
            hash,
            "Version",
            &json!({
                "parents":parent.into_iter().collect::<Vec<_>>(),
                "origin":if lane { json!({"lane":{"scope":"scope","name":"work","hash":lane_hash}}) }
                    else { json!({}) },
                "batchId":batch,
            }),
        );
    }
    write_object(
        &root,
        &lane_hash,
        "Lane",
        &json!({
            "name":"work","scope":"scope","components":[{"id":{"scope":"scope","name":"alpha"},"head":second}],
        }),
    );
    let history_hash = object_hash(&format!("{lane_hash}:LaneHistory"));
    write_object(
        &root,
        &history_hash,
        "LaneHistory",
        &json!({
            "name":"work","scope":"scope","laneHash":lane_hash,
            "history":{"batch-one":{"components":[format!("{identity}@{first}")]},
                "batch-two":{"components":[format!("{identity}@{second}")]}}
        }),
    );
    let version_history_hash = object_hash(&format!("{identity}:VersionHistory"));
    write_object(
        &root,
        &version_history_hash,
        "VersionHistory",
        &json!({
            "name":"alpha","scope":"scope",
            "versions":[{"hash":main,"parents":[]},{"hash":first,"parents":[main]}],
            "graphCompleteRefs":[],
        }),
    );
    fs::write(
        root.join(".bit/index.json"),
        serde_json::to_vec_pretty(&json!({
            "components":[{"id":{"scope":"scope","name":"alpha"},"hash":component_hash}],
            "lanes":[{"id":{"scope":"scope","name":"work"},"hash":lane_hash}],
        }))
        .expect("index"),
    )
    .expect("write index");
    fs::write(
        root.join(".bitmap"),
        crate::inspection::render_bitmap(&json!({
            "alpha":{"name":"alpha","scope":"","defaultScope":"scope","version":second,
                "mainFile":"index.js","rootDir":"alpha"},
            "$schema-version":"17.0.0",
            "_bit_lane":{"id":{"scope":"scope","name":"work"},"exported":false},
        }))
        .expect("render"),
    )
    .expect("write bitmap");
    let plan = Plan::prepare(&root, identity, false, true).expect("plan");
    let stale = Plan::prepare(&root, identity, false, true).expect("stale plan");
    assert_eq!(plan.labels, vec![first, second]);
    plan.commit("2026-10-15-8-30-1").expect("commit");
    let lane = outbound::read_object(&root.join(".bit/objects"), &lane_hash, "Lane").expect("lane");
    assert_eq!(lane["components"], json!([]));
    let bitmap = crate::recovery::jsonc::parse(&fs::read(root.join(".bitmap")).expect("bitmap"))
        .expect("parse");
    assert_eq!(bitmap["alpha"]["version"], "1.0.0");
    let history = outbound::read_object(&root.join(".bit/objects"), &history_hash, "LaneHistory")
        .expect("history");
    assert_eq!(history["history"], json!({}));
    assert!(stale.commit("2026-10-15-8-30-2").is_err());
    fs::remove_dir_all(root).expect("remove fixture");
}
