//! Plan the main and lane history publications.
use super::{
    Path, PathBuf, Plan, ScopeRoot, Value, ancestry, encode, fs, json, lanes, merge,
    metadata_proofs, object_path, read, resolve_component_entry, sha1_hex, stored,
};
use crate::commands::{patterns, version_history::text};

type Proofs = Vec<(PathBuf, Vec<u8>)>;

struct Target {
    scope: String,
    name: String,
    model_hash: String,
    display: String,
    proofs: Proofs,
}

pub(super) fn prepare(
    root: &ScopeRoot,
    id: &str,
    from: Option<&str>,
    all_lanes: bool,
    delete_existing: bool,
) -> Option<Plan> {
    if !super::super::supported_startup(root, &root.path)? {
        return None;
    }
    let mut target = resolve_target(&root.path, id)?;
    let mut proofs = metadata_proofs(&root.path, &target.scope, false)?;
    proofs.append(&mut target.proofs);
    let lane_heads = if all_lanes {
        lanes::lane_heads(&root.path, &target.scope, &target.name, &mut proofs)?
    } else {
        Vec::new()
    };
    if lane_heads.len() > 8 || (cfg!(not(unix)) && !lane_heads.is_empty()) {
        return None;
    }
    let model = read(&root.path, &target.model_hash, "Component", &mut proofs)?;
    let head = from.or_else(|| model["head"].as_str())?;
    finish(root, &target, head, proofs, lane_heads, delete_existing)
}

fn resolve_target(root: &Path, id: &str) -> Option<Target> {
    if id.contains('*') || id.contains(',') {
        return pattern_target(root, id);
    }
    let (scope, name, model_hash) = resolve_component_entry(root, id)?;
    let scope = scope?;
    let display = format!("{scope}/{name}");
    Some(Target { scope, name, model_hash, display, proofs: Vec::new() })
}

struct Candidate {
    scope: String,
    name: String,
    model_hash: String,
    identity: String,
    display: String,
}

fn pattern_target(root: &Path, pattern: &str) -> Option<Target> {
    if pattern
        .split(',')
        .map(str::trim)
        .any(|part| part.starts_with('$') || part.contains(" AND "))
    {
        return None;
    }
    let (candidates, proofs) = pattern_candidates(root)?;
    let refs = candidates
        .iter()
        .map(|item| item.identity.as_str())
        .collect::<Vec<_>>();
    let matched = patterns::matching(&refs, &patterns::split(pattern)).ok()?;
    let [selected] = matched.as_slice() else { return None };
    let selected = (*selected).to_owned();
    let candidate = candidates
        .into_iter()
        .find(|item| item.identity == selected)?;
    Some(Target {
        scope: candidate.scope,
        name: candidate.name,
        model_hash: candidate.model_hash,
        display: candidate.display,
        proofs,
    })
}

fn pattern_candidates(root: &Path) -> Option<(Vec<Candidate>, Proofs)> {
    let index: Value = serde_json::from_slice(&fs::read(root.join("index.json")).ok()?).ok()?;
    let rows = index["components"].as_array()?;
    if rows.len() > 128 {
        return None;
    }
    let mut proofs = Vec::new();
    let mut candidates = Vec::new();
    for row in rows
        .iter()
        .filter(|row| row["isSymlink"] != true)
    {
        if let Some(candidate) = candidate_from_row(root, row, &mut proofs)? {
            candidates.push(candidate);
        }
    }
    Some((candidates, proofs))
}

fn candidate_from_row(root: &Path, row: &Value, proofs: &mut Proofs) -> Option<Option<Candidate>> {
    let model_hash = row["hash"].as_str()?.to_owned();
    let model = read(root, &model_hash, "Component", proofs)?;
    let Some(head) = model["head"].as_str() else {
        return Some(None);
    };
    let scope = row["id"]["scope"].as_str()?.to_owned();
    let name = row["id"]["name"].as_str()?.to_owned();
    let identity = format!("{scope}/{name}");
    let version = text::tags(&model, head).unwrap_or(head);
    let display = format!("{identity}@{version}");
    Some(Some(Candidate { scope, name, model_hash, identity, display }))
}

fn finish(
    root: &ScopeRoot,
    target: &Target,
    head: &str,
    mut proofs: Vec<(PathBuf, Vec<u8>)>,
    lane_heads: Vec<String>,
    delete_existing: bool,
) -> Option<Plan> {
    let hash = sha1_hex(&format!("{}/{}:VersionHistory", target.scope, target.name));
    let path = object_path(&root.path, &hash)?;
    super::group::qualify_parents(&root.path, &path, &proofs)?;
    let (existing, mode) = stored(&root.path, &hash, &path, &mut proofs)?;
    if delete_existing {
        existing.as_ref()?;
        let trash_target = super::trash::target(&root.path, &path)?;
        if !super::absent(&trash_target) {
            proofs.push((trash_target.clone(), fs::read(trash_target).ok()?));
        }
    }
    if !delete_existing
        && existing
            .as_ref()
            .is_some_and(|value| super::super::complete(value, head) != Some(false))
    {
        return None;
    }
    let output = content(
        &root.path,
        &hash,
        head,
        &target.name,
        &target.scope,
        if delete_existing { None } else { existing.as_ref() },
        &mut proofs,
    )?;
    let mut plan = Plan {
        path,
        identity: target.display.clone(),
        payload: output.0,
        later_payloads: Vec::new(),
        proofs,
        count: output.1,
        mode,
    };
    plan.add_lanes(&root.path, &hash, &target.name, &target.scope, lane_heads, output.2)?;
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
