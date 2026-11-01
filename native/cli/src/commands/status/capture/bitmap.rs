//! Bitmap states that need the canonical capture for write commands.

use super::{Capture, missing, text};
use serde_json::Value;
use std::io;

#[inline]
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

#[inline]
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
    if !enabled || !extensions.iter().any(is_remotely_removed_extension) {
        return Ok(());
    }
    let identity = text(
        target
            .get("identity")
            .filter(|val| !val.is_null())
            .or_else(|| target.get("id")),
    )?
    .trim();
    if !identity.is_empty()
        && !captured.remotely_removed
            .iter()
            .any(|existing| existing == identity)
    {
        captured.remotely_removed.push(identity.to_string());
    }
    Ok(())
}

#[inline]
fn is_remotely_removed_extension(extension: &Value) -> bool {
    crate::commands::update_cmd::matches_aspect(extension, "teambit.component/remove")
        && (extension["config"]["removed"] == true || extension["data"]["removed"] == true)
}
