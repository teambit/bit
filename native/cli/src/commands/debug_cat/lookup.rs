use crate::commands::lane::scope_root::ScopeRoot;
use serde_json::Value;
use std::{fs, path::Path};

pub(super) fn load_cat_component(
    root: &ScopeRoot,
    scope_dir: &Path,
    raw_id: &str,
) -> Option<Value> {
    let (bare_id, version_opt) = raw_id
        .rsplit_once('@')
        .map_or((raw_id, None), |(id, ver)| (id, Some(ver)));
    if bare_id.is_empty() || version_opt == Some("") {
        return None;
    }
    let (comp_scope, comp_name, comp_hash) = resolve_component_entry(scope_dir, bare_id)?;
    let (kind, comp_val) = bit_object_import::read_scope_object(scope_dir, &comp_hash).ok()??;
    if kind != "Component" {
        return None;
    }
    let Some(ver) = version_opt else {
        return Some(comp_val);
    };
    let ver_hash = (ver == "latest")
        .then(|| current_lane_head(root, scope_dir, comp_scope.as_deref(), &comp_name))
        .flatten()
        .or_else(|| resolve_version_hash(&comp_val, ver))?;
    let (v_kind, ver_val) = bit_object_import::read_scope_object(scope_dir, &ver_hash).ok()??;
    (v_kind == "Version").then_some(ver_val)
}

fn current_lane_head(
    root: &ScopeRoot,
    scope_dir: &Path,
    comp_scope: Option<&str>,
    comp_name: &str,
) -> Option<String> {
    let lane_val = active_lane_object(root, scope_dir)?;
    if let Some(comp) = lane_val["components"]
        .as_array()
        .and_then(|arr| {
            arr.iter()
                .find(|row| {
                    row["id"]["name"].as_str() == Some(comp_name)
                        && row["id"]["scope"].as_str() == comp_scope
                })
        })
    {
        return comp["head"].as_str().map(str::to_owned);
    }
    let full_id =
        comp_scope.map_or_else(|| comp_name.to_owned(), |scope| format!("{scope}/{comp_name}"));
    lane_val["updateDependents"]
        .as_array()?
        .iter()
        .filter_map(Value::as_str)
        .find_map(|entry| {
            let (id, hash) = entry.rsplit_once('@')?;
            (id == full_id || id == comp_name).then(|| hash.to_owned())
        })
}

fn active_lane_object(root: &ScopeRoot, scope_dir: &Path) -> Option<Value> {
    if root.bare {
        return None;
    }
    let bitmap =
        bit_install::jsonc::parse(&fs::read_to_string(root.path.join(".bitmap")).ok()?).ok()?;
    let lane_id = &bitmap["_bit_lane"]["id"];
    let lane_key = format!("{}/{}", lane_id["scope"].as_str()?, lane_id["name"].as_str()?);
    let (_, _, lane_hash) = resolve_lane_entry(scope_dir, &lane_key)?;
    let (kind, lane_val) = bit_object_import::read_scope_object(scope_dir, &lane_hash).ok()??;
    (kind == "Lane").then_some(lane_val)
}

fn resolve_version_hash(comp_val: &Value, ver: &str) -> Option<String> {
    if ver == "latest" {
        return comp_val["head"].as_str().map(str::to_owned);
    }
    if let Some(hash) = comp_val["versions"].get(ver).and_then(Value::as_str) {
        return Some(hash.to_owned());
    }
    if let Some(hash) = comp_val["orphanedVersions"].get(ver).and_then(Value::as_str) {
        return Some(hash.to_owned());
    }
    (ver.len() == 40 && ver.bytes().all(|byte| byte.is_ascii_hexdigit())).then(|| ver.to_owned())
}

pub(super) fn resolve_lane_entry(scope_dir: &Path, id: &str) -> Option<(String, String, String)> {
    if id == "main" {
        return None;
    }
    let index: Value = serde_json::from_slice(&fs::read(scope_dir.join("index.json")).ok()?).ok()?;
    let lanes = index["lanes"].as_array()?;
    if let Some((scope, name)) = id.split_once('/') {
        return find_lane_in_index(lanes, scope, name);
    }
    let scope_json: Value =
        serde_json::from_slice(&fs::read(scope_dir.join("scope.json")).ok()?).ok()?;
    if let Some(tracked) = scope_json["lanes"]["tracking"]
        .as_array()
        .and_then(|arr| {
            arr.iter()
                .find(|item| item["localLane"].as_str() == Some(id))
        })
    {
        let r_scope = tracked["remoteScope"].as_str()?;
        let r_lane = tracked["remoteLane"].as_str()?;
        return find_lane_in_index(lanes, r_scope, r_lane);
    }
    let matches = lanes
        .iter()
        .filter(|row| row["id"]["name"].as_str() == Some(id))
        .collect::<Vec<_>>();
    let [row] = matches.as_slice() else {
        return None;
    };
    Some((row["id"]["scope"].as_str()?.to_owned(), id.to_owned(), row["hash"].as_str()?.to_owned()))
}

fn find_lane_in_index(
    lanes: &[Value],
    scope: &str,
    name: &str,
) -> Option<(String, String, String)> {
    let row = lanes
        .iter()
        .find(|row| {
            row["id"]["scope"].as_str() == Some(scope) && row["id"]["name"].as_str() == Some(name)
        })?;
    Some((scope.to_owned(), name.to_owned(), row["hash"].as_str()?.to_owned()))
}

pub(in crate::commands) fn resolve_component_entry(
    scope_dir: &Path,
    bare_id: &str,
) -> Option<(Option<String>, String, String)> {
    let index: Value = serde_json::from_slice(&fs::read(scope_dir.join("index.json")).ok()?).ok()?;
    let comps = index["components"].as_array()?;
    let active = comps
        .iter()
        .filter(|row| row["isSymlink"] != true)
        .collect::<Vec<_>>();
    let exact = active
        .iter()
        .filter(|row| {
            let name = row["id"]["name"].as_str().unwrap_or_default();
            match row["id"]["scope"]
                .as_str()
                .filter(|scope| !scope.is_empty())
            {
                Some(scope) => format!("{scope}/{name}") == bare_id,
                None => name == bare_id,
            }
        })
        .collect::<Vec<_>>();
    if let [row] = exact.as_slice() {
        return Some((
            row["id"]["scope"].as_str().map(str::to_owned),
            row["id"]["name"].as_str()?.to_owned(),
            row["hash"].as_str()?.to_owned(),
        ));
    }
    let by_name = active
        .iter()
        .filter(|row| row["id"]["name"].as_str() == Some(bare_id))
        .collect::<Vec<_>>();
    let [row] = by_name.as_slice() else {
        return None;
    };
    Some((
        row["id"]["scope"].as_str().map(str::to_owned),
        row["id"]["name"].as_str()?.to_owned(),
        row["hash"].as_str()?.to_owned(),
    ))
}
