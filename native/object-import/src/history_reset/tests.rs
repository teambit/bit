use super::{State, apply};
use serde_json::{Value, json};
fn call(kind: &str, input: Value) -> Value {
    apply(kind, input, &mut State::default()).expect("native policy")
}
#[test]
fn removed_candidates_compare_only_original_components() {
    assert_eq!(
        call(
            "historyResetCandidates",
            json!({"components":["scope/first_hash"],"removed":["scope/second_hash","scope/first_hash","scope/second_hash"]})
        ),
        json!({"missing":[0,2]}),
    );
}
#[test]
fn local_append_and_tag_cache_preserve_original_ref_provenance() {
    let first_hash = "a".repeat(40);
    let second_hash = "b".repeat(40);
    assert_eq!(
        call(
            "historyResetLocalAppend",
            json!({"sourceOnly":[first_hash],"mainOnly":[first_hash,second_hash,second_hash]})
        ),
        json!({"sourceAppend":[1],"combined":[first_hash,second_hash]}),
    );
    let selected = call(
        "historyResetLocalVersions",
        json!({"sourceOnly":[first_hash,second_hash],"lane":false,"metadata":[],"tags":[{"label":"old","hash":second_hash},{"label":"new","hash":second_hash}],"orphaned":[{"label":"orphan","hash":first_hash}],"lastFoundTag":"old"}),
    );
    assert_eq!(selected["labels"], json!(["new", "orphan"]));
    assert_eq!(selected["selected"], json!([{"source":1},{"source":0}]));
    assert_eq!(selected["lastFoundTag"], "new");
}
#[test]
fn lane_filter_keeps_recorded_head_and_mutated_history_only() {
    let first_hash = "a".repeat(40);
    let second_hash = "b".repeat(40);
    let third_hash = "c".repeat(40);
    let selected = call(
        "historyResetLocalVersions",
        json!({"sourceOnly":[first_hash,second_hash,third_hash],"lane":true,"laneHead":first_hash,"metadata":[{"hash":second_hash,"originLane":false,"squashed":false,"unrelated":false},{"hash":third_hash,"originLane":false,"squashed":true,"unrelated":false}],"tags":[],"orphaned":[]}),
    );
    assert_eq!(selected["selected"], json!([{"source":2},{"source":0}]));
}
#[test]
fn dependency_index_deduplicates_edges_and_filters_batch_candidates() {
    let indexed = call(
        "historyResetDependents",
        json!({"rows":[{"id":"first_hash@1","dependencies":["second_hash@1","second_hash@1"]},{"id":"third_hash@1","dependencies":["second_hash@1"]}],"queries":["second_hash@1","absent"],"exclude":["first_hash@1"]}),
    );
    assert_eq!(
        indexed,
        json!({"dependents":[["first_hash@1","third_hash@1"],[]],"outside":[["third_hash@1"],[]]}),
    );
}
#[test]
fn lane_read_skips_all_head_aliases_and_late_labels_keep_original_order() {
    let first_hash = "a".repeat(40);
    let second_hash = "b".repeat(40);
    assert_eq!(
        call(
            "historyResetLocalRead",
            json!({"sourceOnly":[first_hash,second_hash,first_hash],"laneHead":first_hash})
        ),
        json!({"load":[1]}),
    );
    let mapped = call(
        "historyResetLocalVersions",
        json!({"sourceOnly":[first_hash,second_hash],"lane":false,"metadata":[],"tags":[],"orphaned":[],"reverse":false}),
    );
    assert_eq!(mapped["selected"], json!([{"source":0},{"source":1}]));
    assert_eq!(mapped["lastFoundTagPresent"], false);
    assert!(mapped.get("lastFoundTag").is_none());
}
#[test]
fn history_prune_preserves_key_indices_and_requested_delete_order() {
    use crate::js_json::Value as Js;
    let history = Js::Object(vec![
        ("1".encode_utf16().collect(), Js::Undefined),
        ("2".encode_utf16().collect(), Js::text("second")),
        ("batch".encode_utf16().collect(), Js::text("kept")),
    ]);
    let fields = Js::Object(vec![("history".encode_utf16().collect(), history)]);
    let output =
        call("historyResetLaneHistory", json!({"fields":fields,"keys":["2","absent","1","2"]}));
    assert_eq!(output, json!({"remove":[1,0],"retained":[2]}));
}
#[test]
fn repeated_queries_and_labels_decline_before_unbounded_response_expansion() {
    let mut state = State::default();
    let indexed = apply(
        "historyResetDependents",
        json!({"rows":[{"id":"x".repeat(4000),"dependencies":["target"]}],"queries":vec!["target";4096]}),
        &mut state,
    );
    assert!(indexed.is_err());
    let hash = "a".repeat(40);
    let mapped = apply(
        "historyResetLocalVersions",
        json!({"sourceOnly":vec![hash.clone();4096],"lane":false,"metadata":[],"tags":[{"label":"x".repeat(4000),"hash":hash}],"orphaned":[]}),
        &mut state,
    );
    assert!(mapped.is_err());
}
#[test]
fn soft_aliases_clear_once_and_never_exported_keeps_full_bitmap_order() {
    assert_eq!(
        call("historyResetSoft", json!({"versions":["1.0.0","1.0.0",null,""],"aliases":[0,0,1,2]})),
        json!({"selected":[0]}),
    );
    let selected = call(
        "historyResetNeverExported",
        json!({"fullNames":["scope/first_hash","scope/first_hash","scope/second_hash"]}),
    );
    assert_eq!(selected["unique"], json!([0, 2]));
    assert_eq!(selected["hashes"][0], selected["hashes"][1]);
    assert_eq!(
        selected["hashes"]
            .as_array()
            .expect("aligned hashes")
            .len(),
        3,
    );
}
#[test]
fn invalid_receipt_keeps_revision_and_independent_children_do_not_race() {
    let mut state = State::default();
    let mut owner = apply(
        "historyResetBegin",
        json!({"mode":"real","pattern":false,"head":false,"force":false}),
        &mut state,
    )
    .expect("begin");
    for phase in ["captureLane", "candidates"] {
        owner=apply("historyResetReceipt",json!({"token":owner["token"],"revision":owner["revision"],"phase":phase,"nextCount":2}),&mut state).expect("receipt");
    }
    assert!(apply("historyResetReceipt",json!({"token":owner["token"],"revision":owner["revision"],"phase":"components","nextCount":4097}),&mut state).is_err());
    let fork = apply(
        "historyResetFork",
        json!({"token":owner["token"],"revision":owner["revision"],"count":2}),
        &mut state,
    )
    .expect("fork");
    assert!(
        apply(
            "historyResetFork",
            json!({"token":fork["token"],"revision":fork["revision"],"count":2}),
            &mut state
        )
        .is_err(),
    );
    assert!(
        apply(
            "historyResetReceipt",
            json!({"token":fork["token"],"revision":fork["revision"],"phase":"components"}),
            &mut state
        )
        .is_err(),
    );
    for child in fork["children"].as_array().expect("children") {
        let mut next = child.clone();
        for phase in [
            "model",
            "bitmap",
            "laneHeads",
            "localVersions",
            "headGuard",
            "dependents",
            "batchIds",
            "removeRefs",
            "result",
        ] {
            next = apply(
                "historyResetReceipt",
                json!({"token":next["token"],"revision":next["revision"],"phase":phase}),
                &mut state,
            )
            .expect("independent receipt");
        }
        assert_eq!(next["directive"]["phase"], "done");
        assert_eq!(next["directive"]["count"], 0);
    }
    let next = apply(
        "historyResetReceipt",
        json!({"token":fork["token"],"revision":fork["revision"],"phase":"components"}),
        &mut state,
    )
    .expect("all children completed");
    assert_eq!(next["directive"]["phase"], "laneHistory");
}
