//! Native `bit aspect list [pattern]` and `bit aspect get <component-name> [aspect-id]`.

pub(super) mod debug;
pub(super) mod get;

use super::{CORE_ASPECT_IDS, ListOpts, mutation::BitmapContext};
use crate::{
    commands::{
        color::Chalk,
        list::table,
        scope_set::{Failure, selection},
        script::resolve_workspace_components,
        workspace_command::{self, results::Report},
    },
    native::Outcome,
};
use bit_install::{
    config::{ENVS_ASPECT, MergeConfig, WorkspaceConfig, aspect_id_without_version},
    model::{ComponentId, WorkspaceComponent},
    workspace::{
        AspectEntry, Bitmap, BitmapEntry, ScopeObjects, WORKSPACE_ROOT_DIR, Workspace, aspects,
        by_root_dir_and_name,
    },
};
use serde_json::{Map, Value, json};
use std::{ffi::OsString, fs, path::Path};

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct AspectSourceItem {
    pub aspect_name: String,
    pub source: &'static str,
    pub level: &'static str,
}

pub(super) struct RawOrigin {
    pub source: &'static str,
    pub level: &'static str,
    pub prefer_ws: bool,
    pub entries: Vec<AspectEntry>,
    pub extra_data: Option<Value>,
}

pub(super) struct InspectCtx<'a> {
    pub root: &'a Path,
    pub ws_config: &'a WorkspaceConfig,
    pub objects: ScopeObjects,
    pub core_ids: Vec<String>,
    pub ws_ids: Vec<ComponentId>,
}

impl<'a> InspectCtx<'a> {
    pub(super) fn new(
        root: &'a Path,
        ws_config: &'a WorkspaceConfig,
        ws: &Workspace,
        bitmap: &Bitmap,
    ) -> Result<Self, Failure> {
        let core_ids: Vec<String> = serde_json::from_str(CORE_ASPECT_IDS)
            .map_err(|err| Failure::Declined(err.to_string()))?;
        let ws_ids = bitmap.entries
            .iter()
            .map(|entry| entry.id.clone())
            .collect();
        Ok(Self { root, ws_config, objects: ScopeObjects::new(&ws.scope_path), core_ids, ws_ids })
    }
}

pub(super) fn run_list(
    root: &Path,
    args: &[OsString],
    opts: &ListOpts,
    chalk: Chalk,
) -> Result<Outcome, Failure> {
    let items = collect_list_results(root, opts.pattern.as_deref(), chalk)?;
    if opts.json {
        let payload = build_list_json(items);
        let data = serde_json::to_string_pretty(&payload)
            .map_err(|err| Failure::Declined(err.to_string()))?;
        return workspace_command::execute_json(root, args, "list", |_| {
            Ok(Report { data, code: 0, details: None })
        })
        .map_err(|err| Failure::Declined(err.to_string()));
    }
    let data = render_list_table(&items, opts.debug, chalk, table::colors(args));
    workspace_command::execute_then(root, args, "list", |_| {
        Ok(Report { data, code: 0, details: None })
    })
    .map_err(|err| Failure::Declined(err.to_string()))
}

fn build_list_json(items: Vec<(String, Vec<AspectSourceItem>)>) -> Value {
    let mut map = Map::new();
    for (comp_id, sources) in items {
        let arr = sources
            .into_iter()
            .map(|src| {
                json!({
                    "aspectName": src.aspect_name,
                    "source": src.source,
                    "level": src.level,
                })
            })
            .collect::<Vec<_>>();
        map.insert(comp_id, Value::Array(arr));
    }
    Value::Object(map)
}

pub(super) fn collect_list_results(
    root: &Path,
    pattern: Option<&str>,
    chalk: Chalk,
) -> Result<Vec<(String, Vec<AspectSourceItem>)>, Failure> {
    let ctx = BitmapContext::load(root, chalk)?;
    let (ws_config, ws) =
        resolve_workspace_components(root).map_err(|err| Failure::Declined(err.to_string()))?;
    let entries = select_entries(root, &ctx.bitmap, pattern, chalk)?;
    let inspect_ctx = InspectCtx::new(root, &ws_config, &ws, &ctx.bitmap)?;
    let mut out = Vec::with_capacity(entries.len());
    for entry in entries {
        let comp = find_ws_comp(&ws.components, entry);
        let sources = sources_for_entry(&inspect_ctx, entry, comp)?;
        out.push((selection::entry_full_id(entry), sources));
    }
    Ok(out)
}

fn select_entries<'a>(
    root: &Path,
    bitmap: &'a Bitmap,
    pattern: Option<&str>,
    chalk: Chalk,
) -> Result<Vec<&'a BitmapEntry>, Failure> {
    match pattern {
        Some(pat) => selection::resolve_pattern_entries(root, bitmap, pat, chalk),
        None => Ok(bitmap.entries
            .iter()
            .filter(|entry| entry.owns_its_dir())
            .collect()),
    }
}

pub(super) fn find_ws_comp<'a>(
    components: &'a [WorkspaceComponent],
    entry: &BitmapEntry,
) -> Option<&'a WorkspaceComponent> {
    components
        .iter()
        .find(|comp| comp.id.to_string_without_version() == entry.id.to_string_without_version())
}

fn sources_for_entry(
    ictx: &InspectCtx<'_>,
    entry: &BitmapEntry,
    comp: Option<&WorkspaceComponent>,
) -> Result<Vec<AspectSourceItem>, Failure> {
    let raw_origins = collect_raw_origins(ictx, entry)?;
    let self_id = entry.id.to_string_without_version();
    let mut out: Vec<AspectSourceItem> = Vec::new();
    for origin in raw_origins {
        append_origin_sources(&mut out, origin, &ictx.ws_ids, &self_id);
    }
    let env_id = comp
        .map(|item| item.env_id.trim())
        .filter(|id| !id.is_empty())
        .unwrap_or("teambit.harmony/node");
    for default_aspect in [env_id, ENVS_ASPECT] {
        let default_bare = aspect_id_without_version(default_aspect);
        if !out
            .iter()
            .any(|existing| aspect_id_without_version(&existing.aspect_name) == default_bare)
        {
            out.push(AspectSourceItem {
                aspect_name: default_aspect.to_owned(),
                source: "WorkspaceDefault",
                level: "workspace",
            });
        }
    }
    Ok(out)
}

fn append_origin_sources(
    out: &mut Vec<AspectSourceItem>,
    origin: RawOrigin,
    ws_ids: &[ComponentId],
    self_id: &str,
) {
    for mut aspect in origin.entries {
        if aspect.config.as_str() == Some("-") {
            continue;
        }
        if !aspect.core && aspect_id_without_version(&aspect.id) == self_id {
            continue;
        }
        resolve_aspect_id(&mut aspect, ws_ids, origin.prefer_ws);
        if !out
            .iter()
            .any(|existing| existing.aspect_name == aspect.id)
        {
            out.push(AspectSourceItem {
                aspect_name: aspect.id,
                source: origin.source,
                level: origin.level,
            });
        }
    }
}

impl RawOrigin {
    const fn simple(
        source: &'static str,
        level: &'static str,
        prefer_ws: bool,
        entries: Vec<AspectEntry>,
    ) -> Self {
        Self { source, level, prefer_ws, entries, extra_data: None }
    }
}

pub(super) fn collect_raw_origins(
    ictx: &InspectCtx<'_>,
    entry: &BitmapEntry,
) -> Result<Vec<RawOrigin>, Failure> {
    let mut origins = Vec::new();
    if let Some(cfg) = &entry.config {
        origins.push(RawOrigin::simple(
            "BitmapFile",
            "component",
            false,
            aspects::from_config_object(cfg, &ictx.core_ids),
        ));
    }
    append_merge_origin(&mut origins, ictx, entry)?;
    let (comp_json_exts, propagate) = read_comp_json_origins(ictx.root, entry, &ictx.core_ids)?;
    if let Some(entries) = comp_json_exts {
        origins.push(RawOrigin::simple("ComponentJsonFile", "component", false, entries));
    }
    let (specific, non_specific) = read_model_origins(&ictx.objects, entry)?;
    origins.push(RawOrigin::simple("ModelSpecific", "component", true, specific));
    if propagate && append_variant_origin(&mut origins, ictx, entry)? {
        origins.push(RawOrigin::simple("ModelNonSpecific", "workspace", true, non_specific));
    }
    Ok(origins)
}

fn append_merge_origin(
    origins: &mut Vec<RawOrigin>,
    ictx: &InspectCtx<'_>,
    entry: &BitmapEntry,
) -> Result<(), Failure> {
    let merge_cfg = MergeConfig::load(ictx.root).map_err(|err| Failure::Declined(err.to_string()))?;
    if let Some(merge) = merge_cfg
        .component(&entry.id.to_string_without_version())
        .map_err(|err| Failure::Declined(err.to_string()))?
    {
        origins.push(RawOrigin {
            source: "ConfigMerge",
            level: "workspace",
            prefer_ws: true,
            entries: aspects::from_config_object(&merge.config, &ictx.core_ids),
            extra_data: None,
        });
    }
    Ok(())
}

fn read_model_origins(
    objects: &ScopeObjects,
    entry: &BitmapEntry,
) -> Result<(Vec<AspectEntry>, Vec<AspectEntry>), Failure> {
    let model = objects.component(&entry.id).map_err(|err| Failure::Declined(err.to_string()))?;
    Ok(model
        .as_ref()
        .map(|mdl| aspects::from_model(&mdl.extensions))
        .unwrap_or_default()
        .into_iter()
        .partition(aspects::is_specific))
}

fn append_variant_origin(
    origins: &mut Vec<RawOrigin>,
    ictx: &InspectCtx<'_>,
    entry: &BitmapEntry,
) -> Result<bool, Failure> {
    let variant = by_root_dir_and_name(
        &ictx.ws_config.variants,
        entry.root_dir.trim_end_matches('/'),
        &entry.id.name,
    )
    .map_err(|err| Failure::Declined(err.to_string()))?;
    let lists = variant.extensions
        .iter()
        .map(|ext| aspects::from_config_object(ext, &ictx.core_ids))
        .collect();
    let applied_rules = variant.matched_rules
        .iter()
        .map(|(pattern, spec)| {
            let spec_val = if (*spec - ((*spec as i64) as f64)).abs() < f64::EPSILON {
                json!(*spec as i64)
            } else {
                json!(*spec)
            };
            json!({ "pattern": pattern, "specificity": spec_val })
        })
        .collect::<Vec<_>>();
    origins.push(RawOrigin {
        source: "WorkspaceVariants",
        level: "workspace",
        prefer_ws: true,
        entries: aspects::merge_lists(lists),
        extra_data: Some(json!({ "appliedRules": applied_rules })),
    });
    Ok(variant.propagate)
}

fn read_comp_json_origins(
    root: &Path,
    entry: &BitmapEntry,
    core_ids: &[String],
) -> Result<(Option<Vec<AspectEntry>>, bool), Failure> {
    if entry.root_dir.is_empty() {
        return Ok((None, true));
    }
    let dir = if entry.root_dir == WORKSPACE_ROOT_DIR {
        root.to_path_buf()
    } else {
        root.join(&entry.root_dir)
    };
    let Ok(bytes) = fs::read(dir.join("component.json")) else {
        return Ok((None, true));
    };
    let parsed = bit_object_import::parse_jsonc(&bytes)?;
    let propagate = parsed
        .get("propagate")
        .and_then(Value::as_bool)
        .unwrap_or(true);
    let list = parsed
        .get("extensions")
        .and_then(Value::as_object)
        .map(|ext| aspects::from_config_object(ext, core_ids));
    Ok((list, propagate))
}

pub(super) fn resolve_aspect_id(aspect: &mut AspectEntry, ws_ids: &[ComponentId], prefer_ws: bool) {
    if aspect.core {
        return;
    }
    let without = aspect_id_without_version(&aspect.id).to_owned();
    let Some(found) = ws_ids
        .iter()
        .find(|id| id.to_string_without_version() == without || id.name == without)
    else {
        return;
    };
    let given = aspect.id
        .strip_prefix(&without)
        .and_then(|rest| rest.strip_prefix('@'));
    let version =
        if prefer_ws { found.version.as_deref() } else { given.or(found.version.as_deref()) };
    let base = found.to_string_without_version();
    aspect.id = version.map_or_else(|| base.clone(), |ver| format!("{base}@{ver}"));
}

pub(super) fn render_list_table(
    items: &[(String, Vec<AspectSourceItem>)],
    debug: bool,
    chalk: Chalk,
    colors: bool,
) -> String {
    let rows = items
        .iter()
        .map(|(comp_id, sources)| vec![chalk.cyan(comp_id), format_sources_cell(sources, debug)])
        .collect::<Vec<_>>();
    let full = table::render(&["", ""], &rows, colors);
    let lines = full.lines().collect::<Vec<_>>();
    if lines.len() >= 4 {
        let mut kept = Vec::with_capacity(lines.len() - 2);
        kept.push(lines[0]);
        kept.extend_from_slice(&lines[3..]);
        return kept.join("\n");
    }
    full
}

fn format_sources_cell(sources: &[AspectSourceItem], debug: bool) -> String {
    let longest = sources
        .iter()
        .map(|src| src.aspect_name.len())
        .max()
        .unwrap_or(0);
    sources
        .iter()
        .map(|src| {
            let origin = if debug { format!(" (origin: {})", src.source) } else { String::new() };
            let padded = format!("{:<width$}", src.aspect_name, width = longest);
            format!("{padded} (level: {}){origin}", src.level)
        })
        .collect::<Vec<_>>()
        .join("\n")
}
