use super::{collect::Target, resolve::ResolvedUpdate};
use crate::{
    commands::{
        aspect::{
            serialize_json_preserving_newline, workspace_default_scope, write_bitmap_if_changed,
        },
        set_peer::{DEP_RESOLVER_ID, apply_dep_resolver_config},
        workspace_command,
    },
    workspace,
};
use bit_install::{
    command::edit_workspace_config, dependencies::cache::invalidation::deps_dir, jsonc::Document,
    workspace::Bitmap,
};
use bit_object_import::parse_jsonc;
use serde_json::{Value, json};
use std::{
    collections::BTreeMap,
    fs, io,
    path::{Path, PathBuf},
};

pub(super) fn apply_updates(root: &Path, updates: &[ResolvedUpdate]) -> io::Result<()> {
    apply_workspace_jsonc_updates(root, updates)?;
    apply_comp_json_updates(updates)?;
    apply_bitmap_updates(root, updates)?;
    let _ = fs::remove_dir_all(deps_dir(root));
    Ok(())
}

fn apply_workspace_jsonc_updates(root: &Path, updates: &[ResolvedUpdate]) -> io::Result<()> {
    let has_ws_updates = updates
        .iter()
        .any(|upd| {
            matches!(upd.target, Target::RootPolicy | Target::ModelRoot | Target::Variant(_))
        });
    if !has_ws_updates {
        return Ok(());
    }
    let cloned = updates.to_vec();
    edit_workspace_config(
        root,
        &workspace::scope_path(root),
        &workspace_command::file_id(),
        "update dependencies",
        move |doc| {
            for upd in &cloned {
                apply_single_ws_update(doc, upd);
            }
        },
    )
}

fn apply_single_ws_update(doc: &mut Document, upd: &ResolvedUpdate) {
    match &upd.target {
        Target::RootPolicy | Target::ModelRoot => {
            set_doc_policy_entry(
                doc,
                &[DEP_RESOLVER_ID, "policy", &upd.field, &upd.name],
                &upd.latest_range,
            );
        }
        Target::Variant(pattern) => {
            set_doc_policy_entry(
                doc,
                &[
                    "teambit.workspace/variants",
                    pattern,
                    DEP_RESOLVER_ID,
                    "policy",
                    &upd.field,
                    &upd.name,
                ],
                &upd.latest_range,
            );
        }
        _ => {}
    }
}

fn set_doc_policy_entry(doc: &mut Document, path: &[&str], latest_range: &str) {
    if doc
        .get(path)
        .is_some_and(|val| val.is_object() && val.get("version").is_some())
    {
        let mut ver_path = path.to_vec();
        ver_path.push("version");
        doc.set(&ver_path, &Value::String(latest_range.to_owned()));
    } else {
        doc.set(path, &Value::String(latest_range.to_owned()));
    }
}

fn apply_comp_json_updates(updates: &[ResolvedUpdate]) -> io::Result<()> {
    let mut grouped: BTreeMap<PathBuf, Vec<&ResolvedUpdate>> = BTreeMap::new();
    for upd in updates {
        if let Target::ComponentJson(path) = &upd.target {
            grouped
                .entry(path.clone())
                .or_default()
                .push(upd);
        }
    }
    for (path, group) in grouped {
        update_single_comp_json(&path, &group)?;
    }
    Ok(())
}

fn update_single_comp_json(path: &Path, group: &[&ResolvedUpdate]) -> io::Result<()> {
    let content = fs::read_to_string(path)?;
    let mut parsed: Value = serde_json::from_str(&content).map_err(io::Error::other)?;
    for upd in group {
        let target = &mut parsed["extensions"][DEP_RESOLVER_ID]["policy"][&upd.field][&upd.name];
        if target.is_object() && target.get("version").is_some() {
            target["version"] = Value::String(upd.latest_range.clone());
        } else {
            *target = Value::String(upd.latest_range.clone());
        }
    }
    let bytes = serialize_json_preserving_newline(&content, &parsed)
        .map_err(|_| io::Error::other("failed to serialize component.json"))?;
    fs::write(path, bytes)
}

fn apply_bitmap_updates(root: &Path, updates: &[ResolvedUpdate]) -> io::Result<()> {
    let bitmap_updates: Vec<(&str, &ResolvedUpdate)> = updates
        .iter()
        .filter_map(|upd| match &upd.target {
            Target::Bitmap(name) | Target::ModelBitmap(name) => Some((name.as_str(), upd)),
            _ => None,
        })
        .collect();
    if bitmap_updates.is_empty() {
        return Ok(());
    }
    let bitmap_before = fs::read(root.join(".bitmap"))?;
    let mut bitmap_val = parse_jsonc(&bitmap_before)?;
    let bitmap = load_workspace_bitmap(root)?;
    let changed = apply_bitmap_entry_updates(root, &mut bitmap_val, &bitmap, &bitmap_updates);
    write_bitmap_if_changed(root, &bitmap_before, &bitmap_val, changed, "update (dependencies)")
}

fn load_workspace_bitmap(root: &Path) -> io::Result<Bitmap> {
    let ws_val = parse_jsonc(&fs::read(root.join("workspace.jsonc"))?)?;
    let default_scope = workspace_default_scope(&ws_val).ok();
    Bitmap::load(root, default_scope.as_deref()).map_err(io::Error::other)
}

fn apply_bitmap_entry_updates(
    root: &Path,
    bitmap_val: &mut Value,
    bitmap: &Bitmap,
    bitmap_updates: &[(&str, &ResolvedUpdate)],
) -> bool {
    let mut changed = false;
    for &(comp_name, upd) in bitmap_updates {
        let Some(entry) = bitmap.entries
            .iter()
            .find(|ent| ent.owns_its_dir() && ent.id.name == comp_name)
        else {
            continue;
        };
        let cfg = json!({
            "policy": {
                &upd.field: {
                    &upd.name: &upd.latest_range,
                },
            },
        });
        if apply_dep_resolver_config(root, bitmap_val, entry, cfg, true, true).unwrap_or(false) {
            changed = true;
        }
    }
    changed
}
