//! JSON (`--json`, `--json --legacy`) and text table rendering for native `bit show`.

use super::{deps::DepEntry, workspace_show::LoadedComponent};
use bit_install::config::{DEPENDENCY_RESOLVER_ASPECT, aspect_id_without_version};
use serde_json::{Map, Value, json};

const PKG_ASPECT: &str = "teambit.pkg/pkg";

pub(super) fn legacy_json(loaded: &LoadedComponent) -> Value {
    let comp_deps = loaded.deps
        .iter()
        .filter(|dep| dep.lifecycle == "runtime" && dep.dep_type == "component")
        .map(|dep| {
            json!({
                "id": dep.id,
                "relativePaths": dep.relative_paths,
                "packageName": dep.package_name,
            })
        })
        .collect::<Vec<_>>();
    let pkg_deps = package_dep_map(&loaded.deps, "runtime");
    let dev_pkg_deps = package_dep_map(&loaded.deps, "dev");
    let peer_pkg_deps = package_dep_map(&loaded.deps, "peer");
    let extensions = build_extensions_array(loaded, true);
    let package_properties = extract_package_properties(loaded);
    json!({
        "name": loaded.entry.id.name,
        "scope": loaded.scope,
        "version": loaded.entry.id.version,
        "mainFile": loaded.main_file,
        "rootDir": loaded.entry.root_dir,
        "componentDir": loaded.entry.root_dir,
        "files": loaded.component.files,
        "dependencies": comp_deps,
        "devDependencies": [],
        "peerDependencies": [],
        "packageDependencies": pkg_deps,
        "devPackageDependencies": dev_pkg_deps,
        "peerPackageDependencies": peer_pkg_deps,
        "extensions": extensions,
        "packageProperties": package_properties,
    })
}

pub(super) fn harmony_json(loaded: &LoadedComponent) -> Value {
    let deps_json = serialize_deps(&loaded.deps);
    let extensions = build_extensions_array(loaded, false);
    json!([
        { "title": "id", "json": loaded.full_id() },
        { "title": "name", "json": loaded.entry.id.name },
        { "title": "scope", "json": loaded.scope },
        { "title": "env", "json": loaded.component.env_id },
        { "title": "main file", "json": loaded.main_file },
        { "title": "files", "json": loaded.component.files },
        { "title": "dependencies", "json": deps_json },
        { "title": "configuration", "json": extensions },
        { "title": "extensions", "json": extensions },
    ])
}

pub(super) fn text_report(loaded: &LoadedComponent) -> String {
    let mut lines = vec![
        format!("id: {}", loaded.full_id()),
        format!("scope: {}", loaded.scope),
        format!("name: {}", loaded.entry.id.name),
        format!("env: {}", loaded.component.env_id),
        format!("mainFile: {}", loaded.main_file),
        format!("files: {}", loaded.component.files.join(", ")),
    ];
    if !loaded.deps.is_empty() {
        for lifecycle in ["runtime", "dev", "peer"] {
            let rendered = format_lifecycle_deps(&loaded.deps, lifecycle);
            if !rendered.is_empty() {
                lines.push(format!("{lifecycle} dependencies:\n{rendered}"));
            }
        }
    }
    if loaded.is_removed {
        lines.push("removed: true".to_owned());
    }
    lines.join("\n")
}

fn format_lifecycle_deps(deps: &[DepEntry], lifecycle: &str) -> String {
    let mut filtered = deps
        .iter()
        .filter(|dep| dep.lifecycle == lifecycle)
        .collect::<Vec<_>>();
    if filtered.is_empty() {
        return String::new();
    }
    filtered.sort_by(|left, right| left.id.cmp(&right.id));
    let longest = filtered
        .iter()
        .map(|dep| dep.id.len() + 1 + dep.version.len())
        .max()
        .unwrap_or(50);
    let pad_width = longest + 1;
    let mut out = Vec::with_capacity(filtered.len() * 2);
    for dep in filtered {
        let name_ver = format!("{}@{}", dep.id, dep.version);
        let padded = format!("{name_ver:-<pad_width$}");
        let opt_tag = if dep.optional { "(optional)" } else { "" };
        out.push(format!("{padded} ({}){opt_tag}", dep.dep_type));
        if dep.optional {
            out.push(format!("{name_ver} (optional)"));
        }
    }
    out.join("\n")
}

fn package_dep_map(deps: &[DepEntry], lifecycle: &str) -> Map<String, Value> {
    deps.iter()
        .filter(|dep| dep.lifecycle == lifecycle && dep.dep_type == "package")
        .map(|dep| (dep.id.clone(), Value::String(dep.version.clone())))
        .collect()
}

fn serialize_deps(deps: &[DepEntry]) -> Vec<Value> {
    deps.iter()
        .map(|dep| {
            json!({
                "id": dep.id,
                "version": dep.version,
                "lifecycle": dep.lifecycle,
                "type": dep.dep_type,
                "optional": dep.optional,
                "packageName": dep.package_name,
            })
        })
        .collect()
}

fn build_extensions_array(loaded: &LoadedComponent, legacy: bool) -> Vec<Value> {
    let deps_json = serialize_deps(&loaded.deps);
    let mut has_dep_resolver = false;
    let mut out = Vec::new();
    for (ext_id, ext_cfg) in &loaded.component.config {
        let is_dep_res = aspect_id_without_version(ext_id) == DEPENDENCY_RESOLVER_ASPECT;
        if is_dep_res {
            has_dep_resolver = true;
        }
        let data = if is_dep_res { json!({ "dependencies": deps_json }) } else { json!({}) };
        out.push(format_extension_entry(ext_id, ext_cfg, &data, legacy));
    }
    if !has_dep_resolver && !loaded.deps.is_empty() {
        out.push(format_extension_entry(
            DEPENDENCY_RESOLVER_ASPECT,
            &json!({}),
            &json!({ "dependencies": deps_json }),
            legacy,
        ));
    }
    out
}

fn format_extension_entry(ext_id: &str, config: &Value, data: &Value, legacy: bool) -> Value {
    if legacy {
        json!({
            "name": ext_id,
            "extensionId": ext_id,
            "config": config,
            "data": data,
        })
    } else {
        json!({
            "id": ext_id,
            "name": ext_id,
            "config": config,
            "data": data,
        })
    }
}

fn extract_package_properties(loaded: &LoadedComponent) -> Value {
    for (ext_id, ext_cfg) in &loaded.component.config {
        if aspect_id_without_version(ext_id) == PKG_ASPECT
            && let Some(pkg_json) = ext_cfg
                .get("packageJson")
                .or_else(|| ext_cfg.get("packageJsonProps"))
                .filter(|val| val.is_object())
        {
            return pkg_json.clone();
        }
    }
    json!({})
}
