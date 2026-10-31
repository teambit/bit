//! Debug rendering for `bit aspect get <component-name> --debug [--json]`.

use super::{
    InspectCtx, RawOrigin, collect_raw_origins, find_ws_comp,
    get::{build_get_json, ensure_default_env_aspects, render_get_text, resolve_component_for_get},
    resolve_aspect_id,
};
use crate::{
    commands::{
        aspect::{GetOpts, mutation::BitmapContext},
        color::Chalk,
        scope_set::Failure,
        script::resolve_workspace_components,
        workspace_command::{self, format::Formatter, results::Report},
    },
    native::Outcome,
};
use bit_install::{
    config::{ENVS_ASPECT, aspect_id_without_version},
    model::ComponentId,
    workspace::{
        AspectEntry, BitmapEntry, CORE_ENVS,
        aspects::{Origin, merge_lists},
    },
};
use serde_json::{Map, Value, json};
use std::{ffi::OsString, path::Path};

struct DebugOrigin {
    origin: &'static str,
    extensions: Vec<AspectEntry>,
    extra_data: Option<Value>,
}

struct DebugReport {
    before: Vec<DebugOrigin>,
    after: Vec<AspectEntry>,
    final_entries: Vec<AspectEntry>,
}

pub(super) fn run_get_debug(
    root: &Path,
    args: &[OsString],
    opts: &GetOpts,
    chalk: Chalk,
) -> Result<Outcome, Failure> {
    let report = collect_debug_report(root, &opts.component, chalk)?;
    if opts.json {
        let payload = build_debug_json(&report);
        let data = serde_json::to_string_pretty(&payload)
            .map_err(|err| Failure::Declined(err.to_string()))?;
        return workspace_command::execute_json(root, args, "get", |_| {
            Ok(Report { data, code: 0, details: None })
        })
        .map_err(|err| Failure::Declined(err.to_string()));
    }
    let data = render_debug_text(&report, chalk);
    workspace_command::execute_then(root, args, "get", |_| {
        Ok(Report { data, code: 0, details: None })
    })
    .map_err(|err| Failure::Declined(err.to_string()))
}

fn collect_debug_report(
    root: &Path,
    component: &str,
    chalk: Chalk,
) -> Result<DebugReport, Failure> {
    if component.trim().is_empty() {
        return Err(Failure::Declined("debug aspect component is empty".into()));
    }
    let ctx = BitmapContext::load(root, chalk)?;
    let (ws_config, ws) =
        resolve_workspace_components(root).map_err(|err| Failure::Declined(err.to_string()))?;
    let entry = resolve_component_for_get(root, &ctx.bitmap, component, chalk)?;
    let inspect_ctx = InspectCtx::new(root, &ws_config, &ws, &ctx.bitmap)?;
    let raw_origins = collect_raw_origins(&inspect_ctx, entry)?;
    let (before, after) = merge_debug_origins(entry, &inspect_ctx.ws_ids, raw_origins);
    let mut final_entries = after.clone();
    for item in &mut final_entries {
        if let Value::Object(cfg) = &mut item.config {
            cfg.remove("__specific");
        }
    }
    ensure_default_env_aspects(&mut final_entries, find_ws_comp(&ws.components, entry));
    Ok(DebugReport { before, after, final_entries })
}

fn merge_debug_origins(
    entry: &BitmapEntry,
    ws_ids: &[ComponentId],
    raw_origins: Vec<RawOrigin>,
) -> (Vec<DebugOrigin>, Vec<AspectEntry>) {
    let self_id = entry.id.to_string_without_version();
    let mut before_merge = Vec::new();
    let mut lists = Vec::new();
    let mut removed = Vec::new();
    let mut env_found = false;
    for raw in raw_origins {
        if raw.entries.is_empty() {
            continue;
        }
        let origin = source_to_origin(raw.source);
        let kept = prepare_origin_entries(
            raw.entries,
            origin,
            &self_id,
            ws_ids,
            &mut removed,
            &mut env_found,
        );
        lists.push(kept.clone());
        before_merge.push(DebugOrigin {
            origin: raw.source,
            extensions: kept,
            extra_data: raw.extra_data,
        });
    }
    let mut after_merge = merge_lists(lists);
    after_merge.retain(|item| !removed.contains(&item.id));
    (before_merge, after_merge)
}

fn source_to_origin(source: &str) -> Origin {
    match source {
        "BitmapFile" => Origin::BitmapFile,
        "ConfigMerge" => Origin::ConfigMerge,
        "ComponentJsonFile" => Origin::ComponentJsonFile,
        "ModelSpecific" => Origin::ModelSpecific,
        "WorkspaceVariants" => Origin::WorkspaceVariants,
        _ => Origin::ModelNonSpecific,
    }
}

fn prepare_origin_entries(
    entries: Vec<AspectEntry>,
    origin: Origin,
    self_id: &str,
    ws_ids: &[ComponentId],
    removed: &mut Vec<String>,
    env_found: &mut bool,
) -> Vec<AspectEntry> {
    let prefer = !matches!(origin, Origin::BitmapFile | Origin::ComponentJsonFile);
    let mark_specific = matches!(origin, Origin::BitmapFile | Origin::ComponentJsonFile);
    let mut kept = Vec::new();
    for mut item in entries {
        if mark_specific && let Value::Object(cfg) = &mut item.config {
            cfg.insert("__specific".into(), Value::Bool(true));
        }
        if item.config.as_str() == Some("-") {
            removed.push(item.id.clone());
            continue;
        }
        if !item.core && aspect_id_without_version(&item.id) == self_id {
            continue;
        }
        resolve_aspect_id(&mut item, ws_ids, prefer);
        kept.push(item);
    }
    filter_origin_envs(kept, env_found)
}

fn filter_origin_envs(entries: Vec<AspectEntry>, env_found: &mut bool) -> Vec<AspectEntry> {
    let envs_entry = entries
        .iter()
        .find(|entry| entry.id == ENVS_ASPECT);
    let env = envs_entry.and_then(|entry| {
        entry.config
            .get("env")
            .and_then(Value::as_str)
            .or_else(|| entry.data.get("id").and_then(Value::as_str))
            .map(str::trim)
            .filter(|val| !val.is_empty())
            .map(str::to_owned)
    });
    let has_envs = envs_entry.is_some()
        || entries
            .iter()
            .any(|entry| CORE_ENVS.contains(&entry.id.as_str()));
    if *env_found && has_envs {
        return drop_origin_envs(entries, env.as_deref());
    }
    *env_found |= env.is_some();
    entries
}

fn drop_origin_envs(mut entries: Vec<AspectEntry>, env: Option<&str>) -> Vec<AspectEntry> {
    entries.retain(|entry| {
        let is_env =
            env.is_some_and(|env| entry.id == env || aspect_id_without_version(&entry.id) == env);
        !is_env && !CORE_ENVS.contains(&entry.id.as_str())
    });
    for entry in &mut entries {
        if entry.id == ENVS_ASPECT
            && let Value::Object(config) = &mut entry.config
        {
            config.remove("env");
        }
    }
    entries
}

fn build_debug_json(report: &DebugReport) -> Value {
    let mut map = Map::new();
    for item in &report.before {
        let mut obj = Map::new();
        obj.insert("extensions".into(), build_get_json(&item.extensions, None));
        if let Some(extra) = &item.extra_data {
            obj.insert("extraData".into(), extra.clone());
        }
        map.insert(item.origin.into(), Value::Object(obj));
    }
    map.insert("AfterMerge".into(), json!({ "extensions": build_get_json(&report.after, None) }));
    map.insert(
        "FinalAfterMergeIncludeLoad".into(),
        json!({ "extensions": build_get_json(&report.final_entries, None) }),
    );
    Value::Object(map)
}

fn render_debug_text(report: &DebugReport, chalk: Chalk) -> String {
    let formatter = Formatter::new(chalk);
    let before_merge_out = report.before
        .iter()
        .map(|item| {
            let title = formatter.title(&format!("Origin: {}", item.origin));
            let details = render_get_text(&item.extensions, chalk);
            let more = match &item.extra_data {
                Some(extra) => format!(
                    "\n{} {}",
                    chalk.bold("Extra Data:"),
                    serde_json::to_string_pretty(extra).unwrap_or_default(),
                ),
                None => String::new(),
            };
            format!("{title}\n{details}{more}")
        })
        .collect::<Vec<_>>()
        .join("\n\n");
    let after_merge_out = format!(
        "{}\n{}",
        formatter.title("After merging the origins above"),
        render_get_text(&report.after, chalk),
    );
    let final_out = format!(
        "{}\n{}",
        formatter.title("Final - After merging the origins above and the loaded data"),
        render_get_text(&report.final_entries, chalk),
    );
    Formatter::join(&[before_merge_out, after_merge_out, final_out])
}
