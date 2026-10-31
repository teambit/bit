//! Reconcile acknowledgements with component-level bitmap promotions.
use super::{Prepared, Selected, invalid};
use crate::store::Store;
use rayon::prelude::*;
use serde_json::Value;
use std::{collections::HashSet, fs, io};

pub(super) fn prepare_staged_config(
    bytes: &[u8],
    selected: &[Selected],
    strict: bool,
) -> io::Result<Vec<u8>> {
    let identities = selected
        .iter()
        .filter(|item| !item.labels.is_empty())
        .map(|item| (item.scope.clone(), item.name.clone()))
        .collect::<Vec<_>>();
    prepare_staged_config_ids(bytes, &identities, strict)
}

fn prepare_staged_config_ids(
    bytes: &[u8],
    selected: &[(String, String)],
    strict: bool,
) -> io::Result<Vec<u8>> {
    if selected.is_empty() {
        return Ok(bytes.to_vec());
    }
    let mut rows: Vec<Value> = crate::parse_jsonc(bytes)
        .and_then(|val| serde_json::from_value(val).map_err(io::Error::other))?;
    if rows.len() > 4096 {
        return Err(invalid("outbound staged configuration bounds"));
    }
    let mut found = HashSet::new();
    rows.retain(|row| {
        let matched = selected.iter().find(|(scope, name)| staged_row_matches(row, scope, name));
        if let Some((scope, name)) = matched {
            found.insert(format!("{scope}/{name}"));
            false
        } else {
            true
        }
    });
    if strict && found.len() != selected.len() {
        return Err(invalid("outbound staged configuration lifecycle"));
    }
    serde_json::to_vec_pretty(&rows).map_err(io::Error::other)
}

fn staged_row_matches(row: &Value, scope: &str, name: &str) -> bool {
    if let Some(raw) = row["id"].as_str().map(str::trim) {
        let bare = raw.rsplit_once('@').map_or(raw, |(prefix, _)| prefix.trim());
        return bare == name || bare == format!("{scope}/{name}");
    }
    let row_scope = row["id"]["scope"].as_str().map_or("", str::trim);
    row["id"]["name"].as_str().map(str::trim) == Some(name)
        && (row_scope.is_empty() || row_scope == scope)
}

impl Prepared {
    pub(in super::super) fn resume_acknowledgement(
        &mut self,
        selected: &[(String, String, String)],
        exported_ids: &[String],
    ) -> io::Result<()> {
        let selected_ids = selected
            .iter()
            .map(|(scope, name, version)| format!("{scope}/{name}@{version}"))
            .collect::<HashSet<_>>();
        if selected_ids != self.expected_ids {
            return Err(invalid("outbound resume selection changed"));
        }
        let acknowledged = exported_ids
            .iter()
            .cloned()
            .collect::<HashSet<_>>();
        if acknowledged.len() != exported_ids.len() || !acknowledged.is_subset(&selected_ids) {
            return Err(invalid("outbound resume acknowledgement"));
        }
        let mut promotions = selected
            .iter()
            .filter(|(scope, name, version)| {
                acknowledged.contains(&format!("{scope}/{name}@{version}"))
            })
            .map(|(scope, name, _)| (scope.clone(), name.clone()))
            .collect::<Vec<_>>();
        let mut seen = HashSet::new();
        promotions.retain(|identity| seen.insert(identity.clone()));
        let bitmap = crate::recovery::jsonc::parse(&fs::read(self.root.join(".bitmap"))?)?;
        let tracked = promotions
            .iter()
            .filter(|(scope, name)| present(&bitmap, scope, name))
            .cloned()
            .collect::<Vec<_>>();
        self.bitmap.select_export_promotions(&tracked)?;
        self.output.staged_config = self.preimage.staged_config
            .as_deref()
            .map(|bytes| prepare_staged_config_ids(bytes, &promotions, true))
            .transpose()?;
        self.expected_ids.clone_from(&acknowledged);
        self.known_ids = acknowledged;
        Ok(())
    }

    pub(super) fn reconcile(&mut self, exported_ids: &[String]) -> io::Result<()> {
        let mut promotions = exported_ids
            .iter()
            .map(|id| {
                let identity = id.rsplit_once('@').map_or(id.as_str(), |(identity, _)| identity);
                let (scope, name) = identity
                    .split_once('/')
                    .ok_or_else(|| invalid("outbound acknowledged identity"))?;
                Ok((scope.to_owned(), name.to_owned()))
            })
            .collect::<io::Result<Vec<_>>>()?;
        let mut seen = HashSet::new();
        promotions.retain(|identity| seen.insert(identity.clone()));
        let bitmap = crate::recovery::jsonc::parse(&fs::read(self.root.join(".bitmap"))?)?;
        self.output.updated_ids = updates(&bitmap, &promotions);
        sort_updates(&mut self.output.updated_ids, &promotions);
        self.output.non_existing_ids = promotions
            .iter()
            .filter(|(scope, name)| {
                !present(&bitmap, scope, name)
                    && !self.output.removed_ids.contains(&format!("{scope}/{name}"))
            })
            .map(|(scope, name)| format!("{scope}/{name}"))
            .collect();
        let tracked = promotions
            .iter()
            .filter(|(scope, name)| present(&bitmap, scope, name))
            .cloned()
            .collect::<Vec<_>>();
        self.bitmap.select_export_promotions(&tracked)?;
        self.output.staged_config = self.preimage.staged_config
            .as_deref()
            .map(|bytes| prepare_staged_config_ids(bytes, &promotions, false))
            .transpose()?;
        Ok(())
    }
}

pub(in super::super) fn present(bitmap: &Value, scope: &str, name: &str) -> bool {
    let full = format!("{scope}/{name}");
    bitmap
        .as_object()
        .is_some_and(|rows| {
            rows.iter().any(|(key, row)| row_matches_present(key, row, scope, name, &full))
        })
}

fn row_matches_present(key: &str, row: &Value, scope: &str, name: &str, full: &str) -> bool {
    if key.starts_with('$')
        || matches!(key, "_bit_lane" | "version")
        || !row.is_object()
        || row["isAvailableOnCurrentLane"] == false
        || crate::workspace::engine::client_status::config::is_config_removed(&row["config"])
    {
        return false;
    }
    let key_id = key.rsplit_once('@').map_or(key, |(bare, _)| bare);
    let name_matches = row["name"] == name || key_id == name || key_id == full;
    let scope_matches = row["scope"] == scope
        || (row["scope"]
            .as_str()
            .unwrap_or_default()
            .is_empty()
            && (row["defaultScope"] == scope || key_id == full));
    name_matches && scope_matches
}

fn row_is_promoted(key: &str, row: &Value, scope: &str, name: &str, full: &str) -> bool {
    let key_id = key.rsplit_once('@').map_or(key, |(bare, _)| bare);
    row_matches_present(key, row, scope, name, full)
        && row["scope"]
            .as_str()
            .unwrap_or_default()
            .is_empty()
        && (row["defaultScope"] == scope || key_id == full)
}

fn updates(bitmap: &Value, promotions: &[(String, String)]) -> Vec<String> {
    promotions
        .iter()
        .filter(|(scope, name)| {
            let full = format!("{scope}/{name}");
            bitmap
                .as_object()
                .is_some_and(|rows| {
                    rows.iter().any(|(key, row)| row_is_promoted(key, row, scope, name, &full))
                })
        })
        .map(|(scope, name)| format!("{scope}/{name}"))
        .collect()
}

fn sort_updates(updates: &mut [String], promotions: &[(String, String)]) {
    let mut scopes = Vec::new();
    for (scope, _) in promotions {
        if !scopes.contains(scope) {
            scopes.push(scope.clone());
        }
    }
    updates.sort_by(|left, right| {
        let group = |id: &str| {
            scopes
                .iter()
                .position(|scope| id.starts_with(&format!("{scope}/")))
                .unwrap_or(usize::MAX)
        };
        group(left)
            .cmp(&group(right))
            .then_with(|| left.encode_utf16().cmp(right.encode_utf16()))
    });
}

impl Prepared {
    pub(super) fn write_objects(&self, store: &Store) -> io::Result<()> {
        self.components
            .par_iter()
            .filter(|item| !item.unchanged)
            .try_for_each(|item| {
                let (model, history) = rayon::join(
                    || store.write(&item.model_hash, &item.model_after),
                    || store.write(&item.history_hash, &item.history),
                );
                model.and(history)
            })
    }
}
