use super::{Options, compute_snap_distance, parse_options};
use serde_json::json;

#[test]
fn parses_three_positional_arguments() {
    let s1 = "1111111111111111111111111111111111111111";
    let s2 = "2222222222222222222222222222222222222222";
    assert_eq!(
        parse_options(&["comp1", s1, s2]),
        Some(Options { id: "comp1".into(), source_snap: s1.into(), target_snap: s2.into() }),
    );
    assert_eq!(parse_options(&["comp1", s1]), None);
    assert_eq!(parse_options(&["comp1"]), None);
}

#[test]
fn computes_distance_and_common_ancestor() {
    let base = "0000000000000000000000000000000000000000";
    let src = "1111111111111111111111111111111111111111";
    let tgt = "2222222222222222222222222222222222222222";
    let vh = json!({
        "versions": [
            { "hash": base, "parents": [] },
            { "hash": src, "parents": [base] },
            { "hash": tgt, "parents": [base] }
        ]
    });
    let dist = compute_snap_distance(&vh, src, tgt).expect("distance");
    assert_eq!(dist["snapsOnSourceOnly"], json!([{ "hash": src }]));
    assert_eq!(dist["snapsOnTargetOnly"], json!([{ "hash": tgt }]));
    assert_eq!(dist["commonSnapBeforeDiverge"], json!({ "hash": base }));
}
