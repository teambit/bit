//! Partition lane-history components into existing and restored-deleted [`Phase`] entries via [`phases`].

use super::{Phase, invalid, proof};
use serde_json::Value;
use std::{collections::HashSet, io, path::Path};

pub(super) fn phases(
    item: &Value,
    bitmap: &Value,
    settings: &Value,
    revert: bool,
    restore: bool,
) -> io::Result<Vec<Phase>> {
    let rows = item["components"].as_array().ok_or_else(|| invalid("history components"))?;
    if rows.len() > 4096 {
        return Err(invalid("history component budget"));
    }
    let membership = membership(bitmap, settings)?;
    let mut existing = Vec::with_capacity(rows.len());
    let mut deleted = Vec::new();
    let mut seen = HashSet::with_capacity(rows.len());
    for row in rows {
        let (identity, version) = target(row)?;
        if !seen.insert(identity.clone()) {
            return Err(invalid("history duplicate identity"));
        }
        let absent = revert && restore && !membership.contains(identity.as_str());
        let target = (identity, version);
        if absent { deleted.push(target) } else { existing.push(target) }
    }
    let mut phases = vec![Phase { versions: existing, revert }];
    if !deleted.is_empty() {
        phases.push(Phase { versions: deleted, revert: false });
    }
    Ok(phases)
}
fn membership(bitmap: &Value, settings: &Value) -> io::Result<HashSet<String>> {
    let projected = super::super::lane_context::visibility::identity_bitmap(bitmap, settings)?;
    Ok(projected
        .as_object()
        .ok_or_else(|| invalid("history bitmap"))?
        .iter()
        .filter(|(key, row)| is_component_bitmap_row(key, row))
        .filter_map(|(key, row)| {
            let (scope, name) = crate::reset_lane::bitmap::row_identity(key, row);
            let name = name.trim();
            scope
                .map(str::trim)
                .filter(|sc| !sc.is_empty())
                .or_else(|| {
                    row["defaultScope"]
                        .as_str()
                        .map(str::trim)
                        .filter(|sc| !sc.is_empty())
                })
                .filter(|_| !name.is_empty())
                .map(|scope| format!("{scope}/{name}"))
        })
        .collect())
}

pub(super) fn accept_bitmap(proofs: &mut [proof::Proof], receipt: &Value) -> io::Result<()> {
    let path = receipt["path"]
        .as_str()
        .map(str::trim)
        .filter(|path| !path.is_empty())
        .ok_or_else(|| invalid("history bitmap receipt path"))?;
    let retained = proofs
        .iter_mut()
        .find(|proof| proof.path == Path::new(path))
        .ok_or_else(|| invalid("history bitmap proof absent"))?;
    let before = serde_json::from_value::<Option<String>>(receipt["beforeHash"].clone())
        .map_err(io::Error::other)?
        .map(|hash| hash.trim().to_owned())
        .filter(|hash| !hash.is_empty());
    let after = serde_json::from_value::<Option<String>>(receipt["afterHash"].clone())
        .map_err(io::Error::other)?
        .map(|hash| hash.trim().to_owned())
        .filter(|hash| !hash.is_empty());
    if !retained.is_content() || retained.hash.as_deref().map(str::trim) != before.as_deref() {
        return Err(invalid("history bitmap preimage changed"));
    }
    let mut written = Vec::with_capacity(1);
    proof::read(&retained.path, &mut written)?;
    let first = written
        .into_iter()
        .next()
        .ok_or_else(|| invalid("history bitmap proof missing"))?;
    if first.hash.as_deref().map(str::trim) != after.as_deref() {
        return Err(invalid("history bitmap publication changed"));
    }
    *retained = first;
    Ok(())
}

fn target(row: &Value) -> io::Result<(String, String)> {
    let raw = row
        .as_str()
        .map(str::trim)
        .ok_or_else(|| invalid("history component ID"))?;
    if raw.len() > 4096 {
        return Err(invalid("history component ID budget"));
    }
    let (identity, version) =
        raw.rsplit_once('@').ok_or_else(|| invalid("history versioned ID"))?;
    let identity = identity.trim();
    let version = version.trim();
    let (scope, name) = identity.split_once('/').ok_or_else(|| invalid("history scoped ID"))?;
    let (scope, name) = (scope.trim(), name.trim());
    crate::command_import::lane::component_identity(
        &serde_json::json!({"scope":scope,"name":name}),
    )?;
    if version.is_empty() || version.chars().any(char::is_control) {
        return Err(invalid("history empty version"));
    }
    Ok((format!("{scope}/{name}"), version.to_owned()))
}

#[inline]
fn is_component_bitmap_row(key: &str, row: &Value) -> bool {
    let key = key.trim();
    !key.is_empty()
        && !key.starts_with('$')
        && !matches!(key, "_bit_lane" | "version")
        && row.is_object()
}
