use super::{Update, prepare_bytes};
use serde_json::{Value, json};
use std::path::Path;

fn row(scope: &str, name: &str, root: &str) -> Value {
    json!({"name":name,"scope":scope,"version":"1.0.0","mainFile":"index.js","rootDir":root})
}
fn update(identity: &str) -> Update {
    Update {
        identity: identity.into(),
        version: "1.1.0".into(),
        main_file: "main.js".into(),
        keep_ours: false,
    }
}
fn context() -> Value {
    json!({"lane":{"currentId":{"scope":"local.scope","name":"feature"}}})
}
fn bitmap() -> Value {
    json!({"alpha":row("local.scope","alpha","alpha"),"$schema-version":"17.0.0",
        "_bit_lane":{"id":{"scope":"local.scope","name":"feature"},"exported":true}})
}
fn prepare(
    bitmap: &Value,
    context: &Value,
    updates: &[Update],
    removed: &[String],
) -> std::io::Result<Value> {
    let planned = prepare_bytes(
        Path::new("."),
        serde_json::to_vec(bitmap).unwrap(),
        context,
        updates,
        removed,
    )?;
    crate::recovery::jsonc::parse(&planned.output)
}

#[test]
fn lane_updates_preserve_membership_and_emit_canonical_header_order() {
    let mut bitmap = bitmap();
    bitmap["alpha"]["onLanesOnly"] = json!(true);
    bitmap["alpha"]["isAvailableOnCurrentLane"] = json!(false);
    let result = prepare(&bitmap, &context(), &[update("local.scope/alpha")], &[]).unwrap();
    assert_eq!(result["alpha"]["onLanesOnly"], true);
    assert_eq!(result["alpha"]["isAvailableOnCurrentLane"], true);
    assert_eq!(result["alpha"]["version"], "1.1.0");
    assert_eq!(result["_bit_lane"]["exported"], true);
    assert_eq!(
        result
            .as_object()
            .unwrap()
            .keys()
            .next_back()
            .unwrap(),
        "_bit_lane",
    );
    assert_eq!(
        result["_bit_lane"]["id"]
            .as_object()
            .unwrap()
            .keys()
            .collect::<Vec<_>>(),
        ["name", "scope"],
    );
    let mut mismatched = context();
    mismatched["lane"]["currentId"]["name"] = json!("other");
    assert!(prepare(&bitmap, &mismatched, &[], &[]).is_err());
    assert!(prepare(&bitmap, &json!({}), &[], &[]).is_err());
}

#[test]
fn first_lane_snapshot_marks_the_existing_bitmap_row_lane_only() {
    let mut keep = update("local.scope/alpha");
    keep.keep_ours = true;
    let mut prepared = prepare_bytes(
        Path::new("."),
        serde_json::to_vec(&bitmap()).unwrap(),
        &context(),
        &[keep],
        &[],
    )
    .unwrap();
    prepared
        .mark_lane_new(&context(), &["local.scope/alpha".into()])
        .unwrap();
    let bytes = std::str::from_utf8(&prepared.output).unwrap();
    let result = crate::recovery::jsonc::parse(&prepared.output).unwrap();
    assert_eq!(result["alpha"]["onLanesOnly"], true);
    assert_eq!(result["alpha"]["isAvailableOnCurrentLane"], true);
    assert!(
        bytes.find(r#""onLanesOnly""#).unwrap()
            < bytes.find(r#""isAvailableOnCurrentLane""#).unwrap(),
    );
    assert!(
        prepared
            .mark_lane_new(&context(), &["local.scope/missing".into()])
            .is_err(),
    );
}

#[test]
fn lane_membership_changes_recompute_duplicate_name_keys() {
    let mut context = context();
    context["lane"]["additions"] = json!([row("remote.scope", "alpha", "remote-alpha")]);
    let result = prepare(&bitmap(), &context, &[update("remote.scope/alpha")], &[]).unwrap();
    assert!(result.get("alpha").is_none());
    assert_eq!(result["local.scope/alpha"]["version"], "1.0.0");
    assert_eq!(result["remote.scope/alpha"]["version"], "1.1.0");
    let result = prepare(&result, &context, &[], &["local.scope/alpha".into()]).unwrap();
    assert_eq!(result["alpha"]["scope"], "remote.scope");
    assert!(result.get("remote.scope/alpha").is_none());
    assert!(
        prepare(&bitmap(), &context, &[update("local.scope/alpha")], &["local.scope/alpha".into()])
            .is_err(),
    );
}

#[test]
fn lane_additions_reject_missing_metadata_overlapping_roots_and_absent_ours() {
    assert!(prepare(&bitmap(), &context(), &[update("remote.scope/beta")], &[]).is_err());
    for root in ["alpha", "alpha/nested", "../outside", "."] {
        let mut context = context();
        context["lane"]["additions"] = json!([row("remote.scope", "beta", root)]);
        assert!(
            prepare(&bitmap(), &context, &[update("remote.scope/beta")], &[]).is_err(),
            "{root}",
        );
    }
    let mut context = context();
    context["lane"]["additions"] = json!([row("remote.scope", "beta", "beta")]);
    let mut ours = update("remote.scope/beta");
    ours.keep_ours = true;
    assert!(prepare(&bitmap(), &context, &[ours], &[]).is_err());
}

#[test]
fn inactive_unexported_writer_promotes_scope_but_preserves_default_scope() {
    let mut bitmap = bitmap();
    bitmap["alpha"]["scope"] = json!("");
    bitmap["alpha"]["defaultScope"] = json!("local.scope");
    bitmap["alpha"]["isAvailableOnCurrentLane"] = json!(false);
    let result = prepare(&bitmap, &context(), &[update("local.scope/alpha")], &[]).unwrap();
    assert_eq!(result["alpha"]["scope"], "local.scope");
    assert_eq!(result["alpha"]["defaultScope"], "local.scope");
    bitmap["alpha"]["isAvailableOnCurrentLane"] = json!(true);
    let active = prepare(&bitmap, &context(), &[update("local.scope/alpha")], &[]).unwrap();
    assert_eq!(active["alpha"]["scope"], "");
}
