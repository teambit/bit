//! Unit tests for pending merge [`lane_id`] scope resolution.
//!
//! Checks that `main` resolves against the component scope via [`lane_id`] while named lanes preserve their lane scope across string and object inputs ([`default_pending_lane_uses_component_scope_while_named_lane_retains_its_scope`]).

use super::lane_id;
use serde_json::json;

/// Verifies that [`lane_id`] resolves `main` against the component `scope` and preserves explicit named lane scopes across object and string inputs ([`json`]).
#[test]
fn default_pending_lane_uses_component_scope_while_named_lane_retains_its_scope() {
    let model = json!({"scope":"component.scope"});
    let mut lane = json!({"otherId":{"scope":"workspace.scope","name":"main"}});
    assert_eq!(lane_id(&model, Some(&lane)), json!({"scope":"component.scope","name":"main"}));
    lane["otherId"]["name"] = json!("feature");
    assert_eq!(lane_id(&model, Some(&lane)), lane["otherId"]);
    assert_eq!(
        lane_id(&model, Some(&json!({"otherId": "main"}))),
        json!({"scope": "component.scope", "name": "main"}),
    );
    assert_eq!(
        lane_id(&model, Some(&json!({"otherId": "workspace.scope/feature"}))),
        json!({"scope": "workspace.scope", "name": "feature"}),
    );
}
