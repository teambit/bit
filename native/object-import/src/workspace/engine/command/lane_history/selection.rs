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
    let mut existing = Vec::new();
    let mut deleted = Vec::new();
    let mut seen = HashSet::new();
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
        .filter(|(key, row)| {
            !key.starts_with('$')
                && !matches!(key.as_str(), "_bit_lane" | "version")
                && row.is_object()
        })
        .filter_map(|(key, row)| {
            let (scope, name) = crate::reset_lane::bitmap::row_identity(key, row);
            scope
                .filter(|_| !name.is_empty())
                .map(|scope| format!("{scope}/{name}"))
        })
        .collect())
}

pub(super) fn accept_bitmap(proofs: &mut [proof::Proof], receipt: &Value) -> io::Result<()> {
    let path = receipt["path"].as_str().ok_or_else(|| invalid("history bitmap receipt path"))?;
    let retained = proofs
        .iter_mut()
        .find(|proof| proof.path == Path::new(path))
        .ok_or_else(|| invalid("history bitmap proof absent"))?;
    let before: Option<String> =
        serde_json::from_value(receipt["beforeHash"].clone()).map_err(io::Error::other)?;
    let after: Option<String> =
        serde_json::from_value(receipt["afterHash"].clone()).map_err(io::Error::other)?;
    if !retained.is_content() || retained.hash != before {
        return Err(invalid("history bitmap preimage changed"));
    }
    let mut written = Vec::new();
    proof::read(&retained.path, &mut written)?;
    if written[0].hash != after {
        return Err(invalid("history bitmap publication changed"));
    }
    *retained = written.remove(0);
    Ok(())
}

fn target(row: &Value) -> io::Result<(String, String)> {
    let raw = row.as_str().ok_or_else(|| invalid("history component ID"))?;
    if raw.len() > 4096 {
        return Err(invalid("history component ID budget"));
    }
    let (identity, version) =
        raw.rsplit_once('@').ok_or_else(|| invalid("history versioned ID"))?;
    let (scope, name) = identity.split_once('/').ok_or_else(|| invalid("history scoped ID"))?;
    crate::command_import::lane::component_identity(
        &serde_json::json!({"scope":scope,"name":name}),
    )?;
    if version.is_empty() {
        return Err(invalid("history empty version"));
    }
    Ok((identity.to_owned(), version.to_owned()))
}
