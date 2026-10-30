//! Native `bit aspect get <component-name> [aspect-id]`.

use super::{InspectCtx, RawOrigin, collect_raw_origins, debug::run_get_debug, find_ws_comp};
use crate::{
    commands::{
        aspect::{GetOpts, mutation::BitmapContext},
        color::Chalk,
        scope_set::{Failure, selection},
        script::resolve_workspace_components,
        workspace_command::{self, results::Report},
    },
    native::Outcome,
};
use bit_install::{
    config::{ENVS_ASPECT, aspect_id_without_version},
    model::WorkspaceComponent,
    workspace::{
        AspectEntry,
        aspects::{Merger, Origin, Resolver},
    },
};
use serde_json::{Map, Value, json};
use std::{ffi::OsString, path::Path};

pub(in crate::commands::aspect) fn run_get(
    root: &Path,
    args: &[OsString],
    opts: &GetOpts,
    chalk: Chalk,
) -> Result<Outcome, Failure> {
    if opts.debug {
        return run_get_debug(root, args, opts, chalk);
    }
    let entries = collect_get_entries(root, &opts.component, opts.aspect_id.as_deref(), chalk)?;
    if opts.json {
        let payload = build_get_json(&entries, opts.aspect_id.as_deref());
        let data = serde_json::to_string_pretty(&payload)
            .map_err(|err| Failure::Declined(err.to_string()))?;
        return workspace_command::execute_json(root, args, "get", |_| {
            Ok(Report { data, code: 0, details: None })
        })
        .map_err(|err| Failure::Declined(err.to_string()));
    }
    let data = render_get_text(&entries, chalk);
    workspace_command::execute_then(root, args, "get", |_| {
        Ok(Report { data, code: 0, details: None })
    })
    .map_err(|err| Failure::Declined(err.to_string()))
}

pub(in crate::commands::aspect) fn collect_get_entries(
    root: &Path,
    component: &str,
    aspect_filter: Option<&str>,
    chalk: Chalk,
) -> Result<Vec<AspectEntry>, Failure> {
    let ctx = BitmapContext::load(root, chalk)?;
    let (ws_config, ws) =
        resolve_workspace_components(root).map_err(|err| Failure::Declined(err.to_string()))?;
    let entry = selection::resolve_pattern_entries(root, &ctx.bitmap, component, chalk)?
        .into_iter()
        .next()
        .ok_or_else(|| Failure::User(format!("component {component} was not found")))?;
    let inspect_ctx = InspectCtx::new(root, &ws_config, &ws, &ctx.bitmap)?;
    let raw_origins = collect_raw_origins(&inspect_ctx, entry)?;
    let mut merged = merge_origins(entry, &inspect_ctx.ws_ids, raw_origins);
    ensure_default_env_aspects(&mut merged, find_ws_comp(&ws.components, entry));
    if let Some(target) = aspect_filter {
        let bare = aspect_id_without_version(target);
        merged.retain(|item| item.id == target || aspect_id_without_version(&item.id) == bare);
    }
    Ok(merged)
}

fn merge_origins(
    entry: &bit_install::workspace::BitmapEntry,
    ws_ids: &[bit_install::model::ComponentId],
    raw_origins: Vec<RawOrigin>,
) -> Vec<AspectEntry> {
    let mut merger = Merger::new(Resolver { component: &entry.id, workspace: ws_ids });
    for raw in raw_origins {
        let origin = match raw.source {
            "BitmapFile" => Origin::BitmapFile,
            "ConfigMerge" => Origin::ConfigMerge,
            "ComponentJsonFile" => Origin::ComponentJsonFile,
            "ModelSpecific" => Origin::ModelSpecific,
            "WorkspaceVariants" => Origin::WorkspaceVariants,
            _ => Origin::ModelNonSpecific,
        };
        merger.add(raw.entries, origin);
    }
    merger.finish()
}

pub(super) fn ensure_default_env_aspects(
    merged: &mut Vec<AspectEntry>,
    comp: Option<&WorkspaceComponent>,
) {
    let env_id = comp.map_or("teambit.harmony/node", |item| item.env_id.as_str());
    let env_bare = aspect_id_without_version(env_id);
    if !merged
        .iter()
        .any(|item| aspect_id_without_version(&item.id) == env_bare)
    {
        merged.push(AspectEntry {
            id: env_id.to_owned(),
            core: true,
            config: json!({}),
            data: json!({}),
        });
    }
    if let Some(envs_entry) = merged
        .iter_mut()
        .find(|item| item.id == ENVS_ASPECT)
    {
        if envs_entry.data.get("id").is_none() {
            envs_entry.data = json!({ "id": env_bare });
        }
    } else {
        merged.push(AspectEntry {
            id: ENVS_ASPECT.to_owned(),
            core: true,
            config: json!({ "env": env_bare }),
            data: json!({ "id": env_bare }),
        });
    }
}

pub(super) fn build_get_json(entries: &[AspectEntry], aspect_filter: Option<&str>) -> Value {
    if aspect_filter.is_some() {
        return entries
            .first()
            .map_or(Value::Null, |item| {
                json!({
                    "name": item.id,
                    "config": item.config,
                    "data": item.data,
                })
            });
    }
    let mut map = Map::new();
    for item in entries {
        map.insert(
            item.id.clone(),
            json!({
                "name": item.id,
                "config": item.config,
                "data": item.data,
            }),
        );
    }
    Value::Object(map)
}

pub(in crate::commands::aspect) fn render_get_text(
    entries: &[AspectEntry],
    chalk: Chalk,
) -> String {
    entries
        .iter()
        .map(|item| {
            let cfg = serde_json::to_string_pretty(&item.config).unwrap_or_else(|_| "{}".into());
            let data = serde_json::to_string_pretty(&item.data).unwrap_or_else(|_| "{}".into());
            format!(
                "{}   {}\n{} {cfg}\n{}   {data}\n",
                chalk.bold("name:"),
                item.id,
                chalk.bold("config:"),
                chalk.bold("data:"),
            )
        })
        .collect::<Vec<_>>()
        .join("\n")
}
