//! `bit lane eject` helper logic (`scopes/workspace/eject/eject.main.runtime.ts`).

use super::{add_dependency_to_workspace_jsonc, find_bitmap_row, pkg_name_for, remove_nm_pkg};
use crate::{
    commands::{
        aspect::write_bitmap_if_changed,
        color::Chalk,
        debug_cat::lookup::resolve_component_entry,
        graph_cmd::builder::resolve_ver_hash,
        workspace_command::{self, results::Report},
    },
    native::Outcome,
};
use bit_install::dependencies::cache::invalidation::deps_dir;
use bit_object_import::{parse_jsonc, scope_path};
use serde_json::{Value, json};
use std::{ffi::OsString, fs, io, path::Path};

pub(super) fn is_hub_component_modified(
    root: &Path,
    row: &Value,
    scope: &str,
    name: &str,
    version: &str,
) -> Option<bool> {
    if row["config"]
        .as_object()
        .is_some_and(|cfg| !cfg.is_empty())
    {
        return Some(true);
    }
    let scope_dir = scope_path(root);
    let (_, _, comp_hash) = resolve_component_entry(&scope_dir, &format!("{scope}/{name}"))?;
    let (kind, model) = bit_object_import::read_scope_object(&scope_dir, &comp_hash).ok()??;
    if kind != "Component" {
        return None;
    }
    let ver_hash = resolve_ver_hash(&model, version)?;
    let (v_kind, ver_val) = bit_object_import::read_scope_object(&scope_dir, &ver_hash).ok()??;
    if v_kind != "Version" {
        return None;
    }
    let comp_dir = root.join(row["rootDir"].as_str().unwrap_or(""));
    are_version_files_modified(&scope_dir, &comp_dir, &ver_val)
}

fn are_version_files_modified(scope_dir: &Path, comp_dir: &Path, ver_val: &Value) -> Option<bool> {
    for file_item in ver_val["files"].as_array()? {
        let rel = file_item["relativePath"].as_str()?;
        let blob_hash = file_item["file"].as_str()?;
        let disk_bytes = fs::read(comp_dir.join(rel)).ok()?;
        let (headers, body) = bit_object_import::read_raw_scope_object(scope_dir, blob_hash).ok()??;
        if headers.first()?.as_str() != "Source" || body != disk_bytes {
            return Some(true);
        }
    }
    Some(false)
}

pub(in crate::commands) fn eject_from_lane(
    root: &Path,
    args: &[OsString],
    ids: &[String],
    models: &[Value],
) -> io::Result<Outcome> {
    let chalk = Chalk::detect(args);
    workspace_command::execute_then(root, args, "eject", |_| {
        let bitmap_before = fs::read(root.join(".bitmap"))?;
        let mut bitmap = parse_jsonc(&bitmap_before)?;
        let mut ejected = Vec::new();
        for id in ids {
            let main_version = resolve_main_version(models, id)?;
            if eject_one_lane_component(root, &mut bitmap, id, &main_version)? {
                ejected.push(id.clone());
            }
        }
        write_bitmap_if_changed(root, &bitmap_before, &bitmap, !ejected.is_empty(), "eject")?;
        let _ = fs::remove_dir_all(deps_dir(root));
        let title = chalk.green("successfully ejected the following components");
        let body = ejected.join("\n");
        Ok(Report { data: format!("{title}\n{body}"), code: 0, details: None })
    })
}

fn resolve_main_version(models: &[Value], id: &str) -> io::Result<String> {
    let identity = id.split('@').next().unwrap_or(id);
    let model = models
        .iter()
        .find(|model| {
            format!(
                "{}/{}",
                model["scope"].as_str().unwrap_or_default(),
                model["name"].as_str().unwrap_or_default(),
            ) == identity
        })
        .ok_or_else(|| {
            io::Error::other(format!(r#"unable to eject "{id}" as it has no main version"#))
        })?;
    let head_hash = model["head"]
        .as_str()
        .ok_or_else(|| {
            io::Error::other(format!(r#"unable to eject "{id}" as it has no main version"#))
        })?;
    Ok(crate::commands::show_cmd::remote_show::find_tag_for_hash(model, head_hash)
        .unwrap_or_else(|| head_hash.to_owned()))
}

fn eject_one_lane_component(
    root: &Path,
    bitmap: &mut Value,
    id: &str,
    main_version: &str,
) -> io::Result<bool> {
    let Some((key, row)) = find_bitmap_row(bitmap, id) else { return Ok(false) };
    let (scope, name) = crate::commands::update_cmd::bitmap_row_scope_and_name(&key, &row);
    let root_dir = row["rootDir"].as_str().unwrap_or_default();
    let main_file = row["mainFile"].as_str().unwrap_or("index.js");
    let pkg_name = pkg_name_for(scope, name);
    remove_nm_pkg(root, &pkg_name);
    if root_dir != "." {
        add_dependency_to_workspace_jsonc(root, &pkg_name, main_version)?;
        materialize_ejected_package(
            root,
            &pkg_name,
            scope,
            name,
            main_version,
            main_file,
            root_dir,
        )?;
    }
    if !bitmap[&key]["config"].is_object() {
        bitmap[&key]["config"] = json!({});
    }
    if let Some(cfg) = bitmap[&key]["config"].as_object_mut() {
        cfg.retain(|cfg_key, _| !cfg_key.starts_with("teambit.component/remove@"));
    }
    bitmap[&key]["config"]["teambit.component/remove"] = json!({ "removed": true });
    if !root_dir.is_empty() && root_dir != "." {
        let _ = fs::remove_dir_all(root.join(root_dir));
    }
    Ok(true)
}

pub(super) fn materialize_ejected_package(
    root: &Path,
    pkg_name: &str,
    scope: &str,
    name: &str,
    version: &str,
    main_file: &str,
    root_dir: &str,
) -> io::Result<()> {
    let pkg_dir = root.join("node_modules").join(pkg_name);
    fs::create_dir_all(&pkg_dir)?;
    let src_dir = root.join(root_dir);
    if src_dir.is_dir() {
        copy_dir_files(&src_dir, &pkg_dir)?;
    }
    let pkg_json = json!({
        "name": pkg_name,
        "version": version,
        "main": main_file,
        "componentId": {
            "scope": scope,
            "name": name,
            "version": version,
        },
    });
    fs::write(pkg_dir.join("package.json"), serde_json::to_vec_pretty(&pkg_json)?)
}

fn copy_dir_files(src: &Path, dst: &Path) -> io::Result<()> {
    fs::create_dir_all(dst)?;
    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let path = entry.path();
        let target = dst.join(entry.file_name());
        if path.is_dir() {
            copy_dir_files(&path, &target)?;
        } else if path.is_file() {
            fs::copy(&path, &target)?;
        }
    }
    Ok(())
}
