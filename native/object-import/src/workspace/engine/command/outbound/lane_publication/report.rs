//! Classify acknowledged [`LaneSelected`] exports into [`Reported`] and [`missing`] for the command receipt.

use super::super::{invalid, lane_model::LaneSelected};
use serde_json::Value;
use std::{collections::HashSet, io};

/// Classified updated and removed component identities for an exported lane.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct Reported {
    pub(super) updates: Vec<String>,
    pub(super) removed: Vec<String>,
}

impl Reported {
    /// Classifies selected lane components into updated and removed identity lists.
    pub(super) fn prepare(selected: &LaneSelected) -> io::Result<Self> {
        let selected_ids: HashSet<_> = selected.components.ids
            .iter()
            .map(|id| id.trim())
            .collect();
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
                    selected_ids.contains(identity.as_str()).then_some(identity)
                })
                .collect();
        Ok(Self { updates: selected_update_ids(selected, &selected_ids)?, removed })
    }
}

/// Extracts normalized `scope/name` identities from `selected.lane["updateDependents"]` present in `selected_ids`.
fn selected_update_ids(
    selected: &LaneSelected,
    selected_ids: &HashSet<&str>,
) -> io::Result<Vec<String>> {
    let updates = match selected.lane.get("updateDependents") {
        None | Some(Value::Null) => &[][..],
        Some(Value::Array(updates)) => updates.as_slice(),
        Some(_) => return Err(invalid("outbound lane update-dependents")),
    };
    let mut result = Vec::with_capacity(updates.len());
    for value in updates {
        let id = value
            .as_str()
            .map(str::trim)
            .ok_or_else(|| invalid("outbound lane update-dependent"))?;
        let (identity, _) =
            id.rsplit_once('@').ok_or_else(|| invalid("outbound lane update-dependent id"))?;
        let (scope, name) = identity
            .trim()
            .split_once('/')
            .map(|(scope, name)| (scope.trim(), name.trim()))
            .filter(|(scope, name)| !scope.is_empty() && !name.is_empty())
            .ok_or_else(|| invalid("outbound lane update-dependent id"))?;
        let normalized = format!("{scope}/{name}");
        if selected_ids.contains(normalized.as_str()) {
            result.push(normalized);
        }
    }
    Ok(result)
}

/// Collects exported `scope/name` identities from `exported_ids` that are absent from `bitmap` and `report`.
pub(super) fn missing(report: &Reported, bitmap: &Value, exported_ids: &[String]) -> Vec<String> {
    let mut seen = HashSet::with_capacity(exported_ids.len());
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
