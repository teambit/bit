//! Node's lane merge-filter text report.
//!
//! [`report`] and [`lane_name`] format `--merged` and `--not-merged` [`LaneData`] lists (`merged lanes`, `unmerged lanes`) with [`Formatter`] and [`Chalk`].
use super::LaneData;
use crate::commands::{color::Chalk, workspace_command::format::Formatter};

/// Formats the `merged lanes` or `unmerged lanes` terminal section for `bit lane list` using [`Formatter`].
#[inline]
pub(super) fn report(lanes: &[LaneData], merged: bool, chalk: Chalk) -> String {
    let format = Formatter::new(chalk);
    let items = lanes
        .iter()
        .filter_map(|lane| {
            let name = lane_name(&lane.id);
            let matches = !name.is_empty()
                && name != "main"
                && (lane.is_merged == Some(merged) || !merged && lane.is_merged.is_none());
            matches.then(|| format.item(name))
        })
        .collect::<Vec<_>>();
    if items.is_empty() {
        return format.hint(if merged {
            "none of the lanes is merged"
        } else {
            "all lanes are merged"
        });
    }
    format.section(if merged { "merged lanes" } else { "unmerged lanes" }, "", &items)
}

/// Extracts the trimmed bare lane name from a structured or string lane `id` value.
#[inline]
fn lane_name(id: &serde_json::Value) -> &str {
    id["name"]
        .as_str()
        .map(str::trim)
        .filter(|name| !name.is_empty())
        .or_else(|| {
            id.as_str()
                .map(str::trim)
                .map(|raw| raw.rsplit_once('/').map_or(raw, |(_, name)| name.trim()))
                .filter(|name| !name.is_empty())
        })
        .unwrap_or("")
}
