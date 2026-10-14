use super::{inactive_targets, json, targets};
#[test]
fn active_and_selected_inactive_bitmap_metadata_are_separate() {
    let row = |name: &str, available| json!({"name":name,"scope":"scope","version":"1.0.0","rootDir":name,"mainFile":"index.js","isAvailableOnCurrentLane":available,"onLanesOnly":true});
    let bitmap = json!({"$schema-version":"17.0.0","_bit_lane":{"name":"current","scope":"scope"},"active":row("active",true),"inactive":row("inactive",false),"unselected":row("unselected",false)});
    let selected = json!([{"identity":"scope/inactive","bitmapPresent":true,"visible":false}]);
    let active = targets(&bitmap, &json!({})).unwrap();
    let inactive = inactive_targets(&bitmap, &json!({}), selected.as_array().unwrap()).unwrap();
    assert_eq!(active.len(), 1);
    assert_eq!(active[0]["identity"], "scope/active");
    assert_eq!(inactive.len(), 1);
    assert_eq!(inactive[0]["identity"], "scope/inactive");
    assert_eq!(inactive[0]["version"], "1.0.0");
    assert_eq!(bitmap["inactive"]["isAvailableOnCurrentLane"], false);
}

#[test]
fn lane_history_absence_does_not_fall_back_to_main_for_workspace_components() {
    let main = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    assert_eq!(super::history_head(None, Some(main), true), None);
    assert_eq!(super::history_head(None, Some(main), false), Some(main));
    let hidden = super::Entry {
        identity: "scope/component".into(),
        head: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb".into(),
        hidden: true,
    };
    assert_eq!(super::history_head(Some(&hidden), Some(main), true), Some(hidden.head.as_str()));
}

#[test]
fn unexported_inactive_bitmap_uses_default_scope_without_becoming_an_addition() {
    let bitmap = json!({"$schema-version":"17.0.0","inactive":{"name":"component","scope":"","defaultScope":"scope","version":"1.0.0","rootDir":"existing-root","mainFile":"index.js","isAvailableOnCurrentLane":false}});
    let present = super::bitmap_has(&bitmap, "scope/component");
    assert!(present);
    let selected = json!([{"identity":"scope/component","bitmapPresent":present,"currentIdPresent":present,"visible":false}]);
    let inactive = inactive_targets(&bitmap, &json!({}), selected.as_array().unwrap()).unwrap();
    assert_eq!(inactive[0]["directory"], "existing-root");
    assert_eq!(inactive[0]["version"], "1.0.0");
    let destinations = json!([{"scope":"scope","name":"component","version":"incoming","rootDir":"existing-root","mainFile":"index.js"}]);
    assert!(
        super::super::additions::targets(
            destinations.as_array().unwrap(),
            selected.as_array().unwrap()
        )
        .is_empty(),
    );
    assert_eq!(bitmap["inactive"]["scope"], "");
}

#[test]
fn inactive_identity_inherits_workspace_default_without_changing_stored_bitmap() {
    let bitmap = json!({"$schema-version":"17.0.0","inactive":{"name":"component","scope":"","version":"1.0.0","rootDir":"existing-root","mainFile":"index.js","isAvailableOnCurrentLane":false}});
    let settings = json!({"defaultScope":"workspace.scope"});
    let identities = super::identity_bitmap(&bitmap, &settings).unwrap();
    let present = super::bitmap_has(&identities, "workspace.scope/component");
    assert!(present);
    let selected = json!([{"identity":"workspace.scope/component","bitmapPresent":present,"currentIdPresent":present,"visible":false}]);
    let inactive = inactive_targets(&bitmap, &settings, selected.as_array().unwrap()).unwrap();
    assert_eq!(inactive[0]["directory"], "existing-root");
    let destinations = json!([{"scope":"workspace.scope","name":"component","version":"incoming","rootDir":"existing-root","mainFile":"index.js"}]);
    assert!(
        super::super::additions::targets(
            destinations.as_array().unwrap(),
            selected.as_array().unwrap()
        )
        .is_empty(),
    );
    assert!(bitmap["inactive"].get("defaultScope").is_none());
    let explicit = json!({"component":{"name":"component","scope":"","defaultScope":"row.scope"}});
    assert_eq!(
        super::identity_bitmap(&explicit, &settings).unwrap()["component"]["defaultScope"],
        "row.scope",
    );
}
