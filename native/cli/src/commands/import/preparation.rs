//! Shared inbound request metadata; local eligibility never starts transport or providers.
use super::options::Options;
use crate::commands::{
    engine::Engine,
    status::cache::cache_root,
    workspace_command::{self, NodeCli},
};
use serde_json::{Value, json};
use std::{fs, io, path::Path};

pub(super) enum Preflight {
    Ready,
    Empty,
    Fail(String),
}

pub(super) fn prepare_into(
    engine: &mut Engine,
    root: &Path,
    options: &Options,
    ids: &[String],
) -> io::Result<Value> {
    prepare_into_with(engine, root, options, ids, false)
}
pub(super) fn prepare_into_with(
    engine: &mut Engine,
    root: &Path,
    options: &Options,
    ids: &[String],
    recovery: bool,
) -> io::Result<Value> {
    let mut request = request(root, options, ids)?;
    if recovery {
        request["options"]["recoveryLocal"] = json!(true);
    } else if options.write.merge_strategy.is_some()
        && unmodified_local_tag_merge(engine, root, options, ids)?
    {
        request["options"]["mergeStrategy"] = Value::Null;
    }
    if !options.objects_only {
        request["bitmapHistoryFileId"] = json!(workspace_command::file_id());
    }
    engine.request(&request)
}

pub(super) fn local_preflight(root: &Path, options: &Options) -> io::Result<Preflight> {
    if options.output.json && options.ids.is_empty() {
        return Err(io::Error::other("released no-ID JSON import argument failure"));
    }
    if options.validation_error().is_some() {
        return Ok(Preflight::Ready);
    }
    if let Some(preflight) = empty_ids_write_preflight(root, options)? {
        return Ok(preflight);
    }
    let mut request = request(root, options, &options.ids)?;
    request["kind"] = json!("commandInboundLocalPreflight");
    let mut engine = Engine::new()?;
    match engine.request::<Value>(&request) {
        Ok(response) if response["eligible"] == true => Ok(Preflight::Ready),
        Ok(_) => Err(io::Error::other("native import local eligibility")),
        Err(error) => classify_preflight_error(&mut engine, root, options, &mut request, error),
    }
}

fn empty_ids_write_preflight(root: &Path, options: &Options) -> io::Result<Option<Preflight>> {
    if !options.ids.is_empty()
        || (!options.write.override_existing && !options.write.merge)
    {
        return Ok(None);
    }
    if !bitmap_has_exported_components(root)? {
        return Ok(Some(Preflight::Empty));
    }
    let flag = if options.write.merge { "--merge" } else { "--override" };
    Ok(Some(Preflight::Fail(format!(
        "bit import with no ids and {flag} flag is not supported.\nto write the components from .bitmap file according to the their remote, please use \"bit checkout reset --all\"",
    ))))
}

fn classify_preflight_error(
    engine: &mut Engine,
    root: &Path,
    options: &Options,
    request: &mut Value,
    error: io::Error,
) -> io::Result<Preflight> {
    let message = error.to_string();
    if retry_clean_local_tag(engine, options, request, &message) {
        return Ok(Preflight::Ready);
    }
    if let Some(fail) = preflight_failure_message(engine, root, options, &message)? {
        return Ok(Preflight::Fail(fail));
    }
    Err(error)
}

fn retry_clean_local_tag(
    engine: &mut Engine,
    options: &Options,
    request: &mut Value,
    message: &str,
) -> bool {
    if !message.ends_with("inbound existing component has local versions")
        || options.write.merge_strategy.is_none()
    {
        return false;
    }
    request["options"]["mergeStrategy"] = Value::Null;
    engine
        .request::<Value>(request)
        .is_ok_and(|res| res["eligible"] == true)
}

fn preflight_failure_message(
    engine: &mut Engine,
    root: &Path,
    options: &Options,
    message: &str,
) -> io::Result<Option<String>> {
    if message.ends_with("inbound unsupported workspace directory template") {
        return invalid_directory_template_error(root);
    }
    if message.ends_with("inbound existing workspace file changed") {
        return modified_components_error(engine, root, options);
    }
    if message.ends_with("inbound workspace destination occupied or linked")
        || message.ends_with("inbound workspace destination occupied")
    {
        return destination_error(root, options);
    }
    Ok(None)
}

fn unmodified_local_tag_merge(
    engine: &mut Engine,
    root: &Path,
    options: &Options,
    ids: &[String],
) -> io::Result<bool> {
    let mut preflight = request(root, options, ids)?;
    preflight["kind"] = json!("commandInboundLocalPreflight");
    let Err(error) = engine.request::<Value>(&preflight) else {
        return Ok(false);
    };
    if !error.to_string().ends_with("inbound existing component has local versions") {
        return Ok(false);
    }
    preflight["options"]["mergeStrategy"] = Value::Null;
    Ok(engine
        .request::<Value>(&preflight)
        .is_ok_and(|res| res["eligible"] == true))
}

fn bitmap_has_exported_components(root: &Path) -> io::Result<bool> {
    let path = root.join(".bitmap");
    if !path.exists() {
        return Ok(false);
    }
    let bitmap = bit_object_import::parse_jsonc(&fs::read(path)?)?;
    let Some(rows) = bitmap.as_object() else { return Ok(false) };
    Ok(rows
        .iter()
        .any(|(key, row)| {
            !key.starts_with('$')
                && key != "_bit_lane"
                && row["scope"]
                    .as_str()
                    .is_some_and(|scope| !scope.trim().is_empty())
        }))
}

fn invalid_directory_template_error(root: &Path) -> io::Result<Option<String>> {
    let bytes = fs::read(root.join("workspace.jsonc"))?;
    let ws = bit_object_import::parse_jsonc(&bytes)?;
    let Some((_, ws_entry)) =
        crate::commands::update_cmd::aspect_entry(&ws, "teambit.workspace/workspace")
    else {
        return Ok(None);
    };
    let Some(default_dir) = ws_entry["defaultDirectory"].as_str() else {
        return Ok(None);
    };
    let valid = ["name", "scope", "scopeId", "owner"];
    for part in default_dir.split('/') {
        if part.starts_with('{') && part.ends_with('}') {
            let stripped: String = part
                .chars()
                .filter(|&ch| ch != '{' && ch != '}')
                .collect();
            if !valid.contains(&stripped.as_str()) {
                return Ok(Some(format!(
                    r#"the "{stripped}" part of the component structure "{default_dir}" is invalid, it must be one of the following: {}"#,
                    valid.join(", "),
                )));
            }
        }
    }
    Ok(None)
}

fn modified_components_error(
    engine: &mut Engine,
    root: &Path,
    options: &Options,
) -> io::Result<Option<String>> {
    if options.write.override_existing
        || options.write.merge_strategy.is_some()
        || options.objects_only
        || options.write.adoption.track_only
    {
        return Ok(None);
    }
    let bitmap = bit_object_import::parse_jsonc(&fs::read(root.join(".bitmap"))?)?;
    let Some(rows) = bitmap.as_object() else { return Ok(None) };
    let mut modified = Vec::new();
    for id in &options.ids {
        if id.contains('*') {
            continue;
        }
        if options.ids.len() > 1 && !id_is_modified(engine, root, options, id)? {
            continue;
        }
        let Some(formatted) = bitmap_component_id(rows, id) else { return Ok(None) };
        modified.push(formatted);
    }
    Ok((!modified.is_empty()).then(|| {
        format!(
            "unable to import the following components due to local changes, use --merge flag to merge your local changes or --override to override them\n{} ",
            modified.join("\n"),
        )
    }))
}

fn id_is_modified(
    engine: &mut Engine,
    root: &Path,
    options: &Options,
    id: &str,
) -> io::Result<bool> {
    let mut req = request(root, options, &[id.to_owned()])?;
    req["kind"] = json!("commandInboundLocalPreflight");
    Ok(engine
        .request::<Value>(&req)
        .is_err_and(|err| err.to_string().ends_with("inbound existing workspace file changed")))
}

fn bitmap_component_id(rows: &serde_json::Map<String, Value>, id: &str) -> Option<String> {
    let without_ver = id.rsplit_once('@').map_or(id, |(base, _)| base);
    let (requested_scope, name) = without_ver.split_once('/')?;
    let (key, row) = rows
        .iter()
        .find(|(key, row)| bitmap_row_matches_scope_name(key, row, requested_scope, name))?;
    let key_ver = key.rsplit_once('@').map(|(_, ver)| ver);
    let version = row["version"]
        .as_str()
        .filter(|val| !val.is_empty())
        .or_else(|| key_ver.filter(|val| !val.is_empty()))?;
    Some(format!("{requested_scope}/{name}@{version}"))
}

fn bitmap_row_matches_scope_name(key: &str, row: &Value, scope: &str, name: &str) -> bool {
    if key.starts_with('$') || key == "_bit_lane" || key == "version" || !row.is_object() {
        return false;
    }
    let key_id = key.rsplit_once('@').map_or(key, |(id, _)| id);
    let row_name = crate::commands::update_cmd::bitmap_row_name(key, row);
    let row_scope = row["scope"]
        .as_str()
        .filter(|val| !val.is_empty())
        .or_else(|| {
            row["defaultScope"]
                .as_str()
                .filter(|val| !val.is_empty())
        })
        .or_else(|| key_id.split_once('/').map(|(prefix, _)| prefix));
    row_name == name && row_scope == Some(scope)
}

fn destination_error(root: &Path, options: &Options) -> io::Result<Option<String>> {
    if options.write.adoption.track_only {
        return Ok(None);
    }
    let bitmap = bit_object_import::parse_jsonc(&fs::read(root.join(".bitmap"))?)?;
    let Some(rows) = bitmap.as_object() else { return Ok(None) };
    let template = default_directory_template(root)?;
    for id in &options.ids {
        let Some(abs_dir) = new_target_directory(root, options, rows, &template, id) else {
            continue;
        };
        if let Some(err) = check_target_directory(&abs_dir, options) {
            return Ok(Some(err));
        }
    }
    Ok(None)
}

fn new_target_directory(
    root: &Path,
    options: &Options,
    rows: &serde_json::Map<String, Value>,
    template: &str,
    id: &str,
) -> Option<std::path::PathBuf> {
    if id.contains('*') {
        return None;
    }
    let without_ver = id.rsplit_once('@').map_or(id, |(base, _)| base);
    let (scope, name) = without_ver.split_once('/')?;
    if rows.iter().any(|(key, row)| bitmap_row_matches_scope_name(key, row, scope, name)) {
        return None;
    }
    let rel_dir =
        options.write.path.clone().unwrap_or_else(|| expand_directory(template, scope, name));
    // The retained writer chooses and validates owner-prefixed destinations.
    if options.write.path.is_none()
        && rows
            .values()
            .any(|row| row["rootDir"] == rel_dir)
    {
        return None;
    }
    Some(root.join(rel_dir))
}

fn check_target_directory(abs_dir: &Path, options: &Options) -> Option<String> {
    if fs::symlink_metadata(abs_dir).is_ok_and(|meta| meta.is_file()) {
        return Some(format!("unable to import to {} because it's a file", abs_dir.display()));
    }
    if options.installs()
        && !options.write.override_existing
        && !options.write.adoption.write_to_empty_dir
        && fs::read_dir(abs_dir).is_ok_and(|mut entries| entries.next().is_some())
    {
        return Some(format!(
            "unable to import to {}, the directory is not empty. use --override flag to delete the directory and then import",
            abs_dir.display(),
        ));
    }
    None
}

fn default_directory_template(root: &Path) -> io::Result<String> {
    let bytes = fs::read(root.join("workspace.jsonc"))?;
    let ws = bit_object_import::parse_jsonc(&bytes)?;
    let template = crate::commands::update_cmd::aspect_entry(&ws, "teambit.workspace/workspace")
        .and_then(|(_, entry)| entry["defaultDirectory"].as_str())
        .map(str::trim)
        .filter(|dir| !dir.is_empty())
        .unwrap_or("components/{name}");
    Ok(if template.contains("{name}") {
        template.to_owned()
    } else {
        format!("{}/{{name}}", template.trim_end_matches('/'))
    })
}

fn expand_directory(template: &str, scope: &str, name: &str) -> String {
    let (owner, short) = scope
        .rsplit_once('.')
        .unwrap_or(("", scope));
    template
        .replace("{scopeId}", scope)
        .replace("{scope}", short)
        .replace("{owner}", owner)
        .replace("{name}", name)
}

fn request(root: &Path, options: &Options, ids: &[String]) -> io::Result<Value> {
    let cli = NodeCli::find()?;
    let config = cache_root().join("config");
    Ok(json!({
        "kind": "commandInboundPrepare",
        "root": root,
        "home": workspace_command::home(),
        "globalRemotesFile": config.join("global-remotes.json"),
        "globalConfigDir": config,
        "nodeExecutable": cli.node,
        "bitDir": cli.bit_dir,
        "bitVersion": cli.version,
        "operation": options.operation,
        "ids": ids,
        "options": options.request(),
    }))
}
