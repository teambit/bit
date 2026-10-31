//! Node's lane merge-filter text report.
use super::LaneData;
use crate::commands::{color::Chalk, workspace_command::format::Formatter};

pub(super) fn report(lanes: &[LaneData], merged: bool, chalk: Chalk) -> String {
    let format = Formatter::new(chalk);
    let selected = lanes
        .iter()
        .filter(|lane| {
            lane.is_merged == Some(merged) || !merged && lane.is_merged.is_none()
        });
    let items = selected
        .map(|lane| format.item(lane_name(&lane.id)))
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

fn lane_name(id: &serde_json::Value) -> &str {
    id["name"]
        .as_str()
        .or_else(|| {
            id.as_str()
                .map(|raw| raw.rsplit_once('/').map_or(raw, |(_, name)| name))
        })
        .unwrap_or_default()
}
