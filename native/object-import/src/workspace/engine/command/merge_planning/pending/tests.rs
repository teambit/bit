use super::lane_id;
use serde_json::json;

#[test]
fn default_pending_lane_uses_component_scope_while_named_lane_retains_its_scope() {
    let model = json!({"scope":"component.scope"});
    let mut lane = json!({"otherId":{"scope":"workspace.scope","name":"main"}});
    assert_eq!(lane_id(&model, Some(&lane)), json!({"scope":"component.scope","name":"main"}));
    lane["otherId"]["name"] = json!("feature");
    assert_eq!(lane_id(&model, Some(&lane)), lane["otherId"]);
}
