//! Reconcile acknowledgements with [`Selected`] `.bitmap` promotions via [`prepare_staged_config`].

use super::{Prepared, Selected, invalid};
use crate::store::Store;
use rayon::prelude::*;
use serde_json::Value;
use std::{collections::HashSet, fs, io};

#[inline]
pub(super) fn prepare_staged_config(
    bytes: &[u8],
    selected: &[Selected],
    strict: bool,
) -> io::Result<Vec<u8>> {
    let identities = selected
        .iter()
        .filter(|item| !item.labels.is_empty())
        .map(|item| (item.scope.trim().to_owned(), item.name.trim().to_owned()))
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
            found.insert(format!("{}/{}", scope.trim(), name.trim()));
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
    let (scope, name) = (scope.trim(), name.trim());
    if let Some(raw) = row["id"].as_str().map(str::trim) {
        let bare = raw.rsplit_once('@').map_or(raw, |(prefix, _)| prefix.trim());
        return bare == name
            || bare
                .split_once('/')
                .is_some_and(|(sc, nm)| sc.trim() == scope && nm.trim() == name);
    }
    let row_scope = row["id"]["scope"]
        .as_str()
        .or_else(|| row["scope"].as_str())
        .map_or("", str::trim);
    row["id"]["name"]
        .as_str()
        .or_else(|| row["name"].as_str())
        .map(str::trim)
        == Some(name)
        && (row_scope.is_empty() || row_scope == scope)
}

fn resume_promotions(
    selected: &[(String, String, String)],
    acknowledged: &HashSet<String>,
) -> Vec<(String, String)> {
    let mut promotions = selected
        .iter()
        .filter(|(scope, name, version)| {
            acknowledged.contains(&format!("{}/{}@{}", scope.trim(), name.trim(), version.trim()))
        })
        .map(|(scope, name, _)| (scope.trim().to_owned(), name.trim().to_owned()))
        .collect::<Vec<_>>();
    let mut seen = HashSet::new();
    promotions.retain(|identity| seen.insert(identity.clone()));
    promotions
}

impl Prepared {
    pub(in super::super) fn resume_acknowledgement(
        &mut self,
        selected: &[(String, String, String)],
        exported_ids: &[String],
    ) -> io::Result<()> {
        let selected_ids = selected
            .iter()
            .map(|(scope, name, version)| {
                format!("{}/{}@{}", scope.trim(), name.trim(), version.trim())
            })
            .collect::<HashSet<_>>();
        if selected_ids != self.expected_ids {
            return Err(invalid("outbound resume selection changed"));
        }
        let acknowledged = exported_ids
            .iter()
            .map(|id| id.trim())
            .filter(|id| !id.is_empty())
            .map(str::to_owned)
            .collect::<HashSet<_>>();
        if acknowledged.len() != exported_ids.len() || !acknowledged.is_subset(&selected_ids) {
            return Err(invalid("outbound resume acknowledgement"));
        }
        let promotions = resume_promotions(selected, &acknowledged);
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
                let trimmed = id.trim();
                let identity =
                    trimmed.rsplit_once('@').map_or(trimmed, |(identity, _)| identity.trim());
                let (scope, name) = identity
                    .split_once('/')
                    .map(|(scope, name)| (scope.trim(), name.trim()))
                    .filter(|(scope, name)| !scope.is_empty() && !name.is_empty())
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

#[inline]
fn is_scoped_key(key_id: &str, scope: &str, name: &str) -> bool {
    key_id
        .strip_prefix(scope)
        .and_then(|rest| rest.strip_prefix('/'))
        == Some(name)
}

pub(in super::super) fn present(bitmap: &Value, scope: &str, name: &str) -> bool {
    bitmap
        .as_object()
        .is_some_and(|rows| {
            rows.iter().any(|(key, row)| row_matches_present(key, row, scope, name))
        })
}

fn row_matches_present(key: &str, row: &Value, scope: &str, name: &str) -> bool {
    let key = key.trim();
    if key.starts_with('$')
        || matches!(key, "_bit_lane" | "version")
        || !row.is_object()
        || row["isAvailableOnCurrentLane"] == false
        || crate::workspace::engine::client_status::config::is_config_removed(&row["config"])
    {
        return false;
    }
    let key_id = key.rsplit_once('@').map_or(key, |(bare, _)| bare.trim());
    let row_scope = row["scope"]
        .as_str()
        .map(str::trim)
        .unwrap_or_default();
    let default_scope = row["defaultScope"].as_str().map(str::trim);
    let scoped_key = is_scoped_key(key_id, scope, name);
    let name_matches =
        row["name"].as_str().map(str::trim) == Some(name) || key_id == name || scoped_key;
    let scope_matches = row_scope == scope
        || (row_scope.is_empty() && (default_scope == Some(scope) || scoped_key));
    name_matches && scope_matches
}

fn row_is_promoted(key: &str, row: &Value, scope: &str, name: &str) -> bool {
    let key = key.trim();
    let key_id = key.rsplit_once('@').map_or(key, |(bare, _)| bare.trim());
    row_matches_present(key, row, scope, name)
        && row["scope"]
            .as_str()
            .map(str::trim)
            .unwrap_or_default()
            .is_empty()
        && (row["defaultScope"].as_str().map(str::trim) == Some(scope)
            || is_scoped_key(key_id, scope, name))
}

fn updates(bitmap: &Value, promotions: &[(String, String)]) -> Vec<String> {
    promotions
        .iter()
        .filter(|(scope, name)| {
            bitmap
                .as_object()
                .is_some_and(|rows| {
                    rows.iter().any(|(key, row)| row_is_promoted(key, row, scope, name))
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
            let Some((id_scope, _)) = id.split_once('/') else {
                return usize::MAX;
            };
            scopes
                .iter()
                .position(|scope| scope == id_scope)
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
