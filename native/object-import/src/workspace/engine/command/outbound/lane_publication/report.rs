//! Classify acknowledged lane exports for the command receipt.

use super::super::{invalid, lane_model::LaneSelected};
use std::{collections::HashSet, io};

pub(super) struct Reported {
    pub(super) updates: Vec<String>,
    pub(super) removed: Vec<String>,
}

impl Reported {
    pub(super) fn prepare(selected: &LaneSelected) -> io::Result<Self> {
        let removed = selected.lane["components"]
            .as_array()
            .ok_or_else(|| invalid("outbound lane components"))?
            .iter()
            .filter(|row| row["isDeleted"] == true || row["isRemoved"] == true)
            .filter_map(|row| {
                let scope = row["id"]["scope"].as_str()?;
                let name = row["id"]["name"].as_str()?;
                let identity = format!("{scope}/{name}");
                selected.components.ids.contains(&identity).then_some(identity)
            })
            .collect();
        Ok(Self { updates: selected_update_ids(selected)?, removed })
    }
}

fn selected_update_ids(selected: &LaneSelected) -> io::Result<Vec<String>> {
    let selected_ids: HashSet<_> = selected.components.ids
        .iter()
        .map(String::as_str)
        .collect();
    selected.lane["updateDependents"]
        .as_array()
        .into_iter()
        .flatten()
        .map(|value| {
            let id = value.as_str().ok_or_else(|| invalid("outbound lane update-dependent"))?;
            let (identity, _) =
                id.rsplit_once('@').ok_or_else(|| invalid("outbound lane update-dependent id"))?;
            Ok(selected_ids.contains(identity).then(|| identity.to_owned()))
        })
        .collect::<io::Result<Vec<_>>>()
        .map(|rows| rows.into_iter().flatten().collect())
}
