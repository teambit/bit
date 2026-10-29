//! Plan the main and lane history publications.
use super::{
    Path, PathBuf, Plan, ScopeRoot, Value, ancestry, encode, json, lanes, merge, metadata_proofs,
    object_path, read, resolve_component_entry, safe_parent, sha1_hex, stored,
};

pub(super) fn prepare(
    root: &ScopeRoot,
    id: &str,
    from: Option<&str>,
    all_lanes: bool,
) -> Option<Plan> {
    if !super::super::supported_startup(root, &root.path)? {
        return None;
    }
    let (scope, name, model_hash) = resolve_component_entry(&root.path, id)?;
    let scope = scope?;
    let mut proofs = metadata_proofs(&root.path, &scope, false)?;
    let lane_heads = if all_lanes {
        lanes::lane_heads(&root.path, &scope, &name, &mut proofs)?
    } else {
        Vec::new()
    };
    if lane_heads.len() > 8 || (cfg!(not(unix)) && !lane_heads.is_empty()) {
        return None;
    }
    let model = read(&root.path, &model_hash, "Component", &mut proofs)?;
    let head = from.or_else(|| model["head"].as_str())?;
    finish(root, &scope, &name, head, proofs, lane_heads)
}

fn finish(
    root: &ScopeRoot,
    scope: &str,
    name: &str,
    head: &str,
    mut proofs: Vec<(PathBuf, Vec<u8>)>,
    lane_heads: Vec<String>,
) -> Option<Plan> {
    let hash = sha1_hex(&format!("{scope}/{name}:VersionHistory"));
    let path = object_path(&root.path, &hash)?;
    if !safe_parent(&root.path, &path) {
        return None;
    }
    let (existing, mode) = stored(&root.path, &hash, &path, &mut proofs)?;
    if existing
        .as_ref()
        .is_some_and(|value| super::super::complete(value, head) != Some(false))
    {
        return None;
    }
    let output = content(&root.path, &hash, head, name, scope, existing.as_ref(), &mut proofs)?;
    let mut plan = Plan {
        path,
        identity: format!("{scope}/{name}"),
        payload: output.0,
        later_payloads: Vec::new(),
        proofs,
        count: output.1,
        mode,
    };
    plan.add_lanes(&root.path, &hash, name, scope, lane_heads, output.2)?;
    Some(plan)
}

pub(super) fn content(
    root: &Path,
    hash: &str,
    head: &str,
    name: &str,
    scope: &str,
    existing: Option<&Value>,
    proofs: &mut Vec<(PathBuf, Vec<u8>)>,
) -> Option<(Vec<u8>, usize, Value)> {
    let rows = ancestry(root, head, proofs)?;
    let (rows, count) = merge(existing, rows, name, scope)?;
    let complete = existing.map_or_else(|| json!([]), |value| value["graphCompleteRefs"].clone());
    let value = json!({"name":name,"scope":scope,"versions":rows,"graphCompleteRefs":complete});
    Some((encode(hash, &value).ok()?, count, value))
}

pub(super) fn lane_content(
    root: &Path,
    hash: &str,
    head: &str,
    name: &str,
    scope: &str,
    existing: &Value,
    proofs: &mut Vec<(PathBuf, Vec<u8>)>,
) -> Option<(Vec<u8>, usize, Value)> {
    let ancestors = ancestry(root, head, proofs)?;
    let mut rows = existing["versions"].as_array()?.clone();
    let count = ancestors.len() - usize::from(rows.contains(&ancestors[0]));
    for row in ancestors {
        if let Some(old) = rows
            .iter()
            .find(|old| old["hash"] == row["hash"])
        {
            if old != &row {
                return None;
            }
        } else {
            rows.push(row);
        }
    }
    let value = json!({"name":name,"scope":scope,"versions":rows,"graphCompleteRefs":existing["graphCompleteRefs"]});
    Some((encode(hash, &value).ok()?, count, value))
}
