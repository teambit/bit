//! Classify acknowledged lane exports for the command receipt.

use super::super::{invalid, lane_model::LaneSelected};
use serde_json::Value;
use std::{collections::HashSet, io};

pub(super) struct Reported {
    pub(super) updates: Vec<String>,
    pub(super) removed: Vec<String>,
}

impl Reported {
    pub(super) fn prepare(selected: &LaneSelected) -> io::Result<Self> {
        let removed =
            selected.lane["components"]
                .as_array()
                .ok_or_else(|| invalid("outbound lane components"))?
                .iter()
                .filter(|row| row["isDeleted"] == true || row["isRemoved"] == true)
                .filter_map(|row| {
                    let (scope, name) =
                        crate::workspace::engine::command::inbound::remote::file_list::row_scoped_id_parts(
                            row,
                        )?;
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
            let id = value
                .as_str()
                .map(str::trim)
                .ok_or_else(|| invalid("outbound lane update-dependent"))?;
            let (identity, _) =
                id.rsplit_once('@').ok_or_else(|| invalid("outbound lane update-dependent id"))?;
            let identity = identity.trim();
            if identity.is_empty() {
                return Err(invalid("outbound lane update-dependent id"));
            }
            Ok(selected_ids.contains(identity).then(|| identity.to_owned()))
        })
        .collect::<io::Result<Vec<_>>>()
        .map(|rows| rows.into_iter().flatten().collect())
}

pub(super) fn missing(report: &Reported, bitmap: &Value, exported_ids: &[String]) -> Vec<String> {
    let mut seen = HashSet::new();
    exported_ids
        .iter()
        .filter_map(|id| {
            let trimmed = id.trim();
            let identity =
                trimmed.rsplit_once('@').map_or(trimmed, |(identity, _)| identity.trim());
            if identity.is_empty()
                || !seen.insert(identity)
                || report.updates
                    .iter()
                    .chain(&report.removed)
                    .any(|id| id == identity)
            {
                return None;
            }
            let (scope, name) = identity
                .split_once('/')
                .map(|(scope, name)| (scope.trim(), name.trim()))
                .filter(|(scope, name)| !scope.is_empty() && !name.is_empty())?;
            let present = super::super::publication::reconcile_present(bitmap, scope, name);
            (!present).then(|| format!("{scope}/{name}"))
        })
        .collect()
}
