use super::sha1_hex;
use crate::commands::{color::Chalk, lane::scope_root::ScopeRoot};
use serde_json::Value;
use std::{fs, path::Path};

pub(in crate::commands) fn load_cat_component(
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

pub(in crate::commands) fn resolve_scope_target_id(
    scope_root: &ScopeRoot,
    scope_dir: &Path,
    raw_id: &str,
) -> Option<(String, String)> {
    let (bare_id, version_opt) = raw_id
        .rsplit_once('@')
        .map_or((raw_id, None), |(id, ver)| (id, Some(ver)));
    if bare_id.is_empty() || version_opt == Some("") {
        return None;
    }
    let (id_without_ver, comp_val) = load_scope_component_model(scope_dir, bare_id)?;
    let ver_str = match version_opt {
        Some(ver) if ver != "latest" => ver.to_owned(),
        _ => resolve_head_version_label(&comp_val)?,
    };
    let id_with_ver = format!("{id_without_ver}@{ver_str}");
    load_cat_component(scope_root, scope_dir, &id_with_ver)?;
    Some((id_with_ver, id_without_ver))
}

fn load_scope_component_model(scope_dir: &Path, bare_id: &str) -> Option<(String, Value)> {
    let (comp_scope, comp_name, comp_hash) = resolve_component_entry(scope_dir, bare_id)?;
    let (kind, comp_val) = bit_object_import::read_scope_object(scope_dir, &comp_hash).ok()??;
    if kind != "Component" {
        return None;
    }
    let id_without_ver = match comp_scope
        .as_deref()
        .filter(|scope| !scope.is_empty())
    {
        Some(scope) => format!("{scope}/{comp_name}"),
        None => comp_name,
    };
    Some((id_without_ver, comp_val))
}

fn resolve_head_version_label(comp_val: &Value) -> Option<String> {
    let head = comp_val["head"].as_str()?;
    Some(
        comp_val["versions"]
            .as_object()
            .and_then(|vers| {
                vers.iter()
                    .find(|(_, hash)| hash.as_str() == Some(head))
                    .map(|(tag, _)| tag.clone())
            })
            .unwrap_or_else(|| head.to_owned()),
    )
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

pub(in crate::commands) fn resolve_lane_entry(
    scope_dir: &Path,
    id: &str,
) -> Option<(String, String, String)> {
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

pub(in crate::commands) fn diagnose_lane_lookup_error(
    scope_dir: &Path,
    id: &str,
    for_history: bool,
) -> Option<String> {
    let index: Value = serde_json::from_slice(&fs::read(scope_dir.join("index.json")).ok()?).ok()?;
    let lanes = index["lanes"].as_array()?;
    let scope_json: Value =
        serde_json::from_slice(&fs::read(scope_dir.join("scope.json")).ok()?).ok()?;
    scope_json["name"].as_str()?;
    if let Some((scope, name)) = id.split_once('/') {
        if scope.is_empty() || name.is_empty() || name.contains('/') {
            return None;
        }
        return Some(missing_lane_msg(id, scope, name, for_history));
    }
    if id == "main" {
        return Some(missing_lane_msg("main", "", "main", for_history));
    }
    if let Some(tracked) = scope_json["lanes"]["tracking"]
        .as_array()
        .and_then(|arr| {
            arr.iter()
                .find(|item| item["localLane"].as_str() == Some(id))
        })
    {
        return Some(missing_lane_msg(
            id,
            tracked["remoteScope"].as_str()?,
            tracked["remoteLane"].as_str()?,
            for_history,
        ));
    }
    diagnose_unscoped_lane_error(lanes, id)
}

fn missing_lane_msg(id: &str, scope: &str, name: &str, for_history: bool) -> String {
    if for_history {
        let lane_str = if name == "main" { "main".to_owned() } else { format!("{scope}/{name}") };
        format!(r#"unable to find a lane "{lane_str}""#)
    } else {
        format!("lane {id} was not found!")
    }
}

pub(in crate::commands) fn diagnose_unscoped_lane_error(
    lanes: &[Value],
    id: &str,
) -> Option<String> {
    let count = lanes
        .iter()
        .filter(|row| row["id"]["name"].as_str() == Some(id))
        .count();
    if count == 0 {
        return Some(format!(
            r#"lane "{id}" was not found locally. Please try with scope name, e.g. my-org.my-scope/{id}"#,
        ));
    }
    if count > 1 {
        return Some(format!(
            r#"found more than one lane with the name "{id}", please specify the scope in a form of "<scope>/{id}""#,
        ));
    }
    None
}

pub(in crate::commands) fn diagnose_component_lookup_error(
    scope_dir: &Path,
    raw_id: &str,
    bare_id: &str,
    chalk: Chalk,
) -> Option<String> {
    if raw_id.starts_with('@') || bare_id.is_empty() {
        return None;
    }
    let index: Value = serde_json::from_slice(&fs::read(scope_dir.join("index.json")).ok()?).ok()?;
    let comps = index["components"].as_array()?;
    if bit_object_import::read_scope_object(scope_dir, &sha1_hex(bare_id))
        .ok()
        .flatten()
        .is_some()
    {
        return None;
    }
    if let Some((scope, name)) = bare_id.split_once('/') {
        if scope.is_empty() || name.is_empty() || name.contains('/') {
            return None;
        }
        let display_id = raw_id.strip_suffix("@latest").unwrap_or(raw_id);
        return Some(format!(r#"error: component "{}" was not found"#, chalk.bold(display_id)));
    }
    diagnose_unscoped_component_error(comps, raw_id, bare_id)
}

fn diagnose_unscoped_component_error(
    comps: &[Value],
    raw_id: &str,
    bare_id: &str,
) -> Option<String> {
    if bare_id.contains('.') {
        return None;
    }
    let count = comps
        .iter()
        .filter(|row| row["isSymlink"] != true && row["id"]["name"].as_str() == Some(bare_id))
        .count();
    if count == 0 {
        return Some(format!(
            "scope.getParsedId, the component {raw_id} must include a scope-name",
        ));
    }
    if count > 2 {
        return Some("getHashFromIndex expect to get zero or one result".to_owned());
    }
    None
}
