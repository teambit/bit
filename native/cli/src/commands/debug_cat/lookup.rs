pub(in crate::commands) use crate::commands::lane::scope_root::diagnose_component_lookup_error;
use crate::commands::{
    color::Chalk,
    lane::scope_root::{ScopeRoot, diagnose_version_error},
};
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
    let ver_hash = is_head_alias(ver)
        .then(|| current_lane_head(root, scope_dir, comp_scope.as_deref(), &comp_name))
        .flatten()
        .or_else(|| resolve_version_hash(&comp_val, ver))?;
    let (v_kind, ver_val) = bit_object_import::read_scope_object(scope_dir, &ver_hash).ok()??;
    (v_kind == "Version").then_some(ver_val)
}

fn is_head_alias(ver: &str) -> bool {
    matches!(ver, "latest" | "head")
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
        Some(ver) if !is_head_alias(ver) => ver.to_owned(),
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
    let full_id =
        comp_scope.map_or_else(|| comp_name.to_owned(), |scope| format!("{scope}/{comp_name}"));
    for field in ["components", "updateDependents"] {
        if let Some(head) = lane_val[field]
            .as_array()
            .and_then(|arr| {
                arr.iter()
                    .find_map(|row| match_lane_entry_head(row, comp_scope, comp_name, &full_id))
            })
        {
            return Some(head);
        }
    }
    None
}

fn match_lane_entry_head(
    row: &Value,
    comp_scope: Option<&str>,
    comp_name: &str,
    full_id: &str,
) -> Option<String> {
    if let Some(raw) = row.as_str() {
        let (id, hash) = raw.rsplit_once('@')?;
        return (id == full_id || id == comp_name).then(|| hash.to_owned());
    }
    let head = row["head"]
        .as_str()
        .or_else(|| row["version"].as_str())?;
    let id_node = row.get("id").unwrap_or(row);
    if let Some(raw) = id_node.as_str() {
        let base = raw.split('@').next().unwrap_or(raw);
        return (base == full_id || base == comp_name).then(|| head.to_owned());
    }
    let row_scope = id_node["scope"]
        .as_str()
        .filter(|val| !val.is_empty());
    (id_node["name"].as_str() == Some(comp_name)
        && (row_scope.is_none() || row_scope == comp_scope))
        .then(|| head.to_owned())
}

fn active_lane_object(root: &ScopeRoot, scope_dir: &Path) -> Option<Value> {
    if root.bare {
        return None;
    }
    let bitmap =
        bit_install::jsonc::parse(&fs::read_to_string(root.path.join(".bitmap")).ok()?).ok()?;
    let lane_id = &bitmap["_bit_lane"]["id"];
    let name = lane_id["name"]
        .as_str()
        .filter(|val| !val.is_empty() && *val != "main")?;
    let lane_key = format!("{}/{name}", lane_id["scope"].as_str()?);
    let (_, _, lane_hash) = resolve_lane_entry(scope_dir, &lane_key)?;
    let (kind, lane_val) = bit_object_import::read_scope_object(scope_dir, &lane_hash).ok()??;
    (kind == "Lane").then_some(lane_val)
}

fn resolve_version_hash(comp_val: &Value, ver: &str) -> Option<String> {
    if is_head_alias(ver) {
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
    let index: Value =
        bit_object_import::parse_jsonc(&fs::read(scope_dir.join("index.json")).ok()?).ok()?;
    let lanes = index["lanes"]
        .as_array()
        .map_or(&[][..], Vec::as_slice);
    if let Some((scope, name)) = id.split_once('/') {
        return find_lane_in_index(lanes, scope, name);
    }
    let scope_json =
        bit_object_import::parse_jsonc(&fs::read(scope_dir.join("scope.json")).ok()?).ok()?;
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
    let index: Value =
        bit_object_import::parse_jsonc(&fs::read(scope_dir.join("index.json")).ok()?).ok()?;
    let active: Vec<&Value> = index["components"]
        .as_array()
        .or_else(|| index.as_array())?
        .iter()
        .filter(|row| row["isSymlink"] != true)
        .collect();
    let exact: Vec<&Value> = active
        .iter()
        .copied()
        .filter(|row| {
            let (scope, name) = index_row_scope_and_name(row);
            if scope.is_empty() { name == bare_id } else { format!("{scope}/{name}") == bare_id }
        })
        .collect();
    let row = if let [exact_row] = exact.as_slice() {
        *exact_row
    } else {
        let by_name: Vec<&Value> = active
            .into_iter()
            .filter(|row| index_row_scope_and_name(row).1 == bare_id)
            .collect();
        let [name_row] = by_name.as_slice() else {
            return None;
        };
        *name_row
    };
    let (scope, name) = index_row_scope_and_name(row);
    (!name.is_empty()).then_some(())?;
    Some((
        (!scope.is_empty()).then(|| scope.to_owned()),
        name.to_owned(),
        row["hash"].as_str()?.to_owned(),
    ))
}

fn index_row_scope_and_name(row: &Value) -> (&str, &str) {
    if let Some(id_str) = row["id"].as_str() {
        let bare = id_str
            .split('@')
            .next()
            .unwrap_or(id_str);
        return bare
            .split_once('/')
            .unwrap_or(("", bare));
    }
    (
        row["id"]["scope"].as_str().unwrap_or_default(),
        row["id"]["name"].as_str().unwrap_or_default(),
    )
}

pub(in crate::commands) fn diagnose_lane_lookup_error(
    scope_dir: &Path,
    id: &str,
    for_history: bool,
) -> Option<String> {
    let index: Value =
        bit_object_import::parse_jsonc(&fs::read(scope_dir.join("index.json")).ok()?).ok()?;
    let lanes = index["lanes"]
        .as_array()
        .map_or(&[][..], Vec::as_slice);
    let scope_json =
        bit_object_import::parse_jsonc(&fs::read(scope_dir.join("scope.json")).ok()?).ok()?;
    scope_json["name"].as_str()?;
    if let Some((scope, name)) = id.split_once('/') {
        return (!scope.is_empty() && !name.is_empty() && !name.contains('/')).then(|| {
            missing_lane_msg(id, scope, name, for_history)
        });
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
    match lanes
        .iter()
        .filter(|row| row["id"]["name"].as_str() == Some(id))
        .count()
    {
        0 => Some(format!(
            r#"lane "{id}" was not found locally. Please try with scope name, e.g. my-org.my-scope/{id}"#,
        )),
        count if count > 1 => Some(format!(
            r#"found more than one lane with the name "{id}", please specify the scope in a form of "<scope>/{id}""#,
        )),
        _ => None,
    }
}

pub(in crate::commands) fn diagnose_cat_component_error(
    root: &ScopeRoot,
    scope_dir: &Path,
    raw_id: &str,
    chalk: Chalk,
) -> Option<String> {
    let (bare_id, version_opt) = raw_id
        .rsplit_once('@')
        .map_or((raw_id, None), |(id, ver)| (id, Some(ver)));
    if bare_id.is_empty() || version_opt == Some("") {
        return None;
    }
    let Some((comp_scope, comp_name, comp_hash)) = resolve_component_entry(scope_dir, bare_id)
    else {
        return diagnose_component_lookup_error(scope_dir, raw_id, bare_id, chalk);
    };
    let (kind, comp_val) = bit_object_import::read_scope_object(scope_dir, &comp_hash).ok()??;
    let ver = (kind == "Component").then_some(version_opt).flatten()?;
    let comp_id = comp_scope
        .as_deref()
        .filter(|scope| !scope.is_empty())
        .map_or_else(|| comp_name.clone(), |scope| format!("{scope}/{comp_name}"));
    let lane_head = is_head_alias(ver)
        .then(|| current_lane_head(root, scope_dir, comp_scope.as_deref(), &comp_name))
        .flatten();
    diagnose_version_error(
        scope_dir,
        &comp_id,
        &comp_val,
        ver,
        lane_head.as_deref(),
        resolve_head_version_label(&comp_val).as_deref(),
        resolve_version_hash(&comp_val, ver).as_deref(),
        chalk,
    )
}
