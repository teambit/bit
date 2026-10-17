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
        .map(|lane| format.item(lane.id["name"].as_str().unwrap_or_default()))
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
