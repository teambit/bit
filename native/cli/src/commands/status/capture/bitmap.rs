//! Bitmap states that need the canonical capture for write commands.

use super::{Capture, missing, text};
use serde_json::Value;
use std::io;

pub(super) fn capture_special(
    context: &Value,
    target: &Value,
    captured: &mut Capture,
) -> io::Result<bool> {
    if missing::status_removed(target, captured)? {
        return Ok(true);
    }
    missing::status_pending(context, target, captured)
}

pub(super) fn has_special_state(targets: &[Value]) -> bool {
    targets
        .iter()
        .any(|target| {
            target["localOnly"] == true
                || target["softTagged"] == true
                || target["locallyRemoved"] == true
        })
}

pub(super) fn record_remote(
    enabled: bool,
    target: &Value,
    extensions: &[Value],
    captured: &mut Capture,
) -> io::Result<()> {
    if enabled
        && extensions
            .iter()
            .any(|extension| {
                crate::commands::update_cmd::matches_aspect(extension, "teambit.component/remove")
                    && extension["config"]["removed"] == true
            })
    {
        captured.remotely_removed.push(text(target.get("identity"))?.to_string());
    }
    Ok(())
}
