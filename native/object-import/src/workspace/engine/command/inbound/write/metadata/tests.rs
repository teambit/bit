use serde_json::json;

#[test]
fn live_order_preserves_existing_positions_and_appends_only_new_targets() {
    let mut rows = json!({
        "comp1":{"name":"comp1","scope":"remote","version":"0.0.1"},
        "comp4":{"name":"comp4","scope":"remote","version":"0.0.1"}
    });
    rows["comp4"]["version"] = json!("0.0.2");
    rows["comp2"] = json!({"name":"comp2","scope":"remote"});
    rows["comp3"] = json!({"name":"comp3","scope":"remote"});
    assert_eq!(
        super::ordered_ids(rows.as_object().unwrap(), "workspace").unwrap(),
        ["remote/comp1", "remote/comp4", "remote/comp2", "remote/comp3"],
    );
    rows.as_object_mut()
        .unwrap()
        .sort_keys();
    assert_eq!(
        rows.as_object()
            .unwrap()
            .keys()
            .collect::<Vec<_>>(),
        ["comp1", "comp2", "comp3", "comp4"],
    );
}

#[test]
fn live_order_resolves_authored_and_row_specific_default_scopes() {
    let rows = json!({
        "authored":{"name":"authored","scope":""},
        "specific":{"name":"specific","defaultScope":"specific.scope"}
    });
    assert_eq!(
        super::ordered_ids(rows.as_object().unwrap(), "workspace.scope").unwrap(),
        ["workspace.scope/authored", "specific.scope/specific"],
    );
}
