//! Bitmap states that need the canonical capture for write commands.

use serde_json::Value;

pub(super) fn has_special_state(targets: &[Value]) -> bool {
    targets
        .iter()
        .any(|target| {
            target["localOnly"] == true
                || target["softTagged"] == true
                || target["locallyRemoved"] == true
        })
}
