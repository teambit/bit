//! Native workspace compilation for standard `node` / `react` components.

use super::{
    Options,
    transpile::{dist_rel_path, is_compilable_file, source_map_json, transpile_source},
};
use crate::{
    commands::{
        color::Chalk,
        inventory,
        workspace_command::{self, format::Formatter, results::Report},
    },
    native::Outcome,
};
use bit_install::{
    config::{WorkspaceConfig, aspect_id_without_version},
    links::{link_prepared_component, prepared_package_manifest},
    model::{ComponentDependencies, Manifest, WorkspaceComponent},
    workspace::{BitmapEntry, Workspace},
};
use serde_json::{Value, json};
use std::{ffi::OsString, fs, io, path::Path};

const CORE_ASPECT_IDS: &str =
    include_str!("../../../../../scopes/harmony/testing/load-aspect/core-aspects-ids.json");

const PRESERVED_MANIFEST_KEYS: &[&str] = &[
    "dependencies",
    "devDependencies",
    "peerDependencies",
    "optionalDependencies",
    "peerDependenciesMeta",
    "bit",
];

pub(super) fn try_run(
    root: &Path,
    args: &[OsString],
    options: &Options,
) -> io::Result<Option<Outcome>> {
    if options.changed
        || options.generate_types
        || options.json
        || root.join("merge-conflict").exists()
    {
        return Ok(None);
    }
    let Some(ws) = load_eligible_workspace(root) else {
        return Ok(None);
    };
    let Some(targets) = select_targets(&ws, &options.components) else {
        return Ok(None);
    };
    let mut compiled = Vec::with_capacity(targets.len());
    for (_, component) in &targets {
        let dists = compile_component(root, &ws, component)?;
        compiled.push((component.id.to_string_without_version(), dists));
    }
    let formatter = Formatter::new(Chalk::detect(args));
    let data = render_compile_report(&formatter, &compiled, options.verbose);
    let outcome = workspace_command::execute_then(root, args, "compile", move |_| {
        Ok(Report { data, code: 0, details: None })
    })?;
    Ok(Some(outcome))
}

fn load_eligible_workspace(root: &Path) -> Option<Workspace> {
    let ws_config = WorkspaceConfig::load(root).ok()?;
    if ws_config.workspace.bitmap_auto_sync == Some(true) {
        return None;
    }
    let core_ids: Vec<String> = serde_json::from_str(CORE_ASPECT_IDS).ok()?;
    let ws = Workspace::load(root, &ws_config, &core_ids).ok()?;
    if !ws.active().all(|(entry, comp)| is_supported_component(entry, comp)) {
        return None;
    }
    Some(ws)
}

fn is_supported_component(_entry: &BitmapEntry, component: &WorkspaceComponent) -> bool {
    if component.is_env {
        return false;
    }
    let env = aspect_id_without_version(&component.env_id);
    if !matches!(env, "teambit.harmony/node" | "teambit.react/react") {
        return false;
    }
    let has_custom_file = component.files
        .iter()
        .any(|file| {
            file.ends_with(".extension.ts")
                || file.ends_with(".extension.js")
                || file.ends_with(".bit-env.ts")
                || file.ends_with(".bit-env.js")
                || file.ends_with(".aspect.ts")
                || file.ends_with(".aspect.js")
                || file.ends_with(".main.runtime.ts")
                || file.ends_with(".main.runtime.js")
                || file == "env.jsonc"
                || file == "babel.config.json"
                || file.contains(".node-app.")
                || file.contains(".react-app.")
        });
    if has_custom_file {
        return false;
    }
    component.config
        .keys()
        .all(|key| is_standard_aspect(aspect_id_without_version(key)))
}

fn is_standard_aspect(id: &str) -> bool {
    matches!(
        id,
        "teambit.harmony/node"
            | "teambit.react/react"
            | "teambit.envs/envs"
            | "teambit.dependencies/dependency-resolver"
            | "teambit.pkg/pkg"
            | "teambit.pipelines/builder"
            | "teambit.compilation/compiler"
            | "teambit.defender/tester"
            | "teambit.defender/linter"
            | "teambit.typescript/typescript"
            | "teambit.component/dev-files"
            | "teambit.component/deprecation"
            | "teambit.component/issues"
            | "teambit.preview/preview"
            | "teambit.compositions/compositions",
    )
}

fn select_targets<'a>(
    ws: &'a Workspace,
    selectors: &[String],
) -> Option<Vec<(&'a BitmapEntry, &'a WorkspaceComponent)>> {
    if selectors.is_empty() {
        return Some(ws.active().collect());
    }
    let mut matched = Vec::new();
    for raw_id in selectors {
        let pair = ws.active().find(|(entry, _)| matches_entry(entry, raw_id))?;
        if !matched
            .iter()
            .any(|(existing, _): &(&BitmapEntry, &WorkspaceComponent)| {
                existing.key == pair.0.key
            })
        {
            matched.push(pair);
        }
    }
    Some(matched)
}

fn matches_entry(entry: &BitmapEntry, raw_id: &str) -> bool {
    let normalized = inventory::normalize(raw_id);
    let dir = normalized
        .strip_prefix("./")
        .unwrap_or(&normalized)
        .trim_end_matches('/');
    let root_dir = entry.root_dir.trim_end_matches('/');
    entry.id.to_string_without_version() == raw_id
        || entry.id.name == raw_id
        || entry.key == raw_id
        || (!root_dir.is_empty() && root_dir == dir)
}

fn compile_component(
    root: &Path,
    ws: &Workspace,
    component: &WorkspaceComponent,
) -> io::Result<Vec<String>> {
    if component.root_dir == "." {
        return Ok(Vec::new());
    }
    let package_dir = root.join("node_modules").join(&component.package_name);
    let manifest = build_manifest(&package_dir, component);
    link_prepared_component(root, component, manifest.as_ref(), None)?;
    prune_broken_symlinks(&package_dir)?;
    let dist_dir = package_dir.join("dist");
    let _ = fs::remove_dir_all(&dist_dir);
    fs::create_dir_all(&dist_dir)?;
    let mut dist_files = Vec::new();
    for rel_file in &component.files {
        emit_dist_file(component, &dist_dir, rel_file, &mut dist_files)?;
    }
    let bit_roots = root.join("node_modules/.bit_roots");
    link_prepared_component(root, component, None, Some(&bit_roots))?;
    sync_dependent_component_node_modules(&package_dir, ws, component)?;
    Ok(dist_files)
}

fn build_manifest(package_dir: &Path, component: &WorkspaceComponent) -> Option<Manifest> {
    if component.has_package_json {
        return None;
    }
    let props = json!({
        "main": "dist/{main}.js",
        "types": "{main}.ts",
    });
    let mut manifest = prepared_package_manifest(
        component,
        &ComponentDependencies::default(),
        &props,
        "bit.cloud",
        false,
    );
    if let Ok(text) = fs::read_to_string(package_dir.join("package.json"))
        && let Ok(Value::Object(existing)) = serde_json::from_str::<Value>(&text)
    {
        for &key in PRESERVED_MANIFEST_KEYS {
            if let Some(val) = existing.get(key) {
                manifest.insert(key.to_owned(), val.clone());
            }
        }
    }
    Some(manifest)
}

fn emit_dist_file(
    component: &WorkspaceComponent,
    dist_dir: &Path,
    rel_file: &str,
    dist_files: &mut Vec<String>,
) -> io::Result<()> {
    let src_path = component.dir.join(rel_file);
    if is_compilable_file(rel_file) {
        let out_rel = dist_rel_path(rel_file);
        let out_path = dist_dir.join(&out_rel);
        if let Some(parent) = out_path.parent() {
            fs::create_dir_all(parent)?;
        }
        let out_name = out_path
            .file_name()
            .map_or_else(|| out_rel.clone(), |name| name.to_string_lossy().into_owned());
        let map_name = format!("{out_name}.map");
        let src_text = fs::read_to_string(&src_path)?;
        let js_out = transpile_source(&src_text, rel_file, &map_name);
        let map_out = source_map_json(rel_file, &out_name, &component.dir);
        fs::write(&out_path, js_out)?;
        fs::write(dist_dir.join(format!("{out_rel}.map")), map_out)?;
        dist_files.push(out_rel.clone());
        dist_files.push(format!("{out_rel}.map"));
    } else if src_path.is_file() {
        let out_path = dist_dir.join(rel_file);
        if let Some(parent) = out_path.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::copy(&src_path, &out_path)?;
        dist_files.push(rel_file.to_owned());
    }
    Ok(())
}

fn prune_broken_symlinks(dir: &Path) -> io::Result<()> {
    let Ok(entries) = fs::read_dir(dir) else {
        return Ok(());
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path
            .symlink_metadata()
            .is_ok_and(|meta| meta.file_type().is_symlink())
            && !path.exists()
        {
            let _ = fs::remove_file(&path);
        } else if path.is_dir() && !path.is_symlink() {
            prune_broken_symlinks(&path)?;
        }
    }
    Ok(())
}

fn sync_dependent_component_node_modules(
    package_dir: &Path,
    ws: &Workspace,
    component: &WorkspaceComponent,
) -> io::Result<()> {
    let pkg_canon = fs::canonicalize(package_dir).ok();
    for (_, other) in ws.active() {
        if other.id == component.id || other.root_dir == "." {
            continue;
        }
        let target_dir = other.dir.join("node_modules").join(&component.package_name);
        if !target_dir.is_dir() {
            continue;
        }
        if fs::canonicalize(&target_dir).ok() == pkg_canon {
            continue;
        }
        copy_dir_contents(package_dir, &target_dir)?;
    }
    Ok(())
}

fn copy_dir_contents(src_dir: &Path, dst_dir: &Path) -> io::Result<()> {
    fs::create_dir_all(dst_dir)?;
    for entry in fs::read_dir(src_dir)? {
        let entry = entry?;
        let src_path = entry.path();
        let dst_path = dst_dir.join(entry.file_name());
        if src_path.is_dir() {
            copy_dir_contents(&src_path, &dst_path)?;
        } else if src_path.is_file() {
            let _ = fs::remove_file(&dst_path);
            fs::copy(&src_path, &dst_path)?;
        }
    }
    Ok(())
}

fn render_compile_report(
    formatter: &Formatter,
    compiled: &[(String, Vec<String>)],
    verbose: bool,
) -> String {
    let count = compiled.len();
    let compiled_output = if verbose {
        compiled
            .iter()
            .map(|(id, files)| format_compiled_component(formatter, id, files))
            .collect::<Vec<_>>()
            .join("\n\n")
    } else {
        String::new()
    };
    let summary =
        formatter.success_summary(&format!("{count}/{count} components compiled successfully."));
    let timing = formatter.hint("Finished. (1ms)");
    Formatter::join(&[compiled_output, format!("{summary}\n{timing}")])
}

fn format_compiled_component(formatter: &Formatter, id: &str, files: &[String]) -> String {
    let mut line = formatter.item(id);
    if !files.is_empty() {
        let details = files
            .iter()
            .map(|file| format!("\t\t - {file}"))
            .collect::<Vec<_>>()
            .join("\n");
        line.push('\n');
        line.push_str(&details);
    }
    line
}
