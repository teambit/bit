//! JSON (`--json`, `--json --legacy`) and text table rendering for native `bit show`.

use super::{deps::DepEntry, remote_show::ext_id_str, workspace_show::LoadedComponent};
use bit_install::config::{DEPENDENCY_RESOLVER_ASPECT, aspect_id_without_version};
use serde_json::{Map, Value, json};

const PKG_ASPECT: &str = "teambit.pkg/pkg";
const DEV_FILES_ASPECT: &str = "teambit.component/dev-files";

pub(super) fn legacy_json(loaded: &LoadedComponent) -> Value {
    let comp_deps = component_dep_list(&loaded.deps, "runtime");
    let dev_comp_deps = component_dep_list(&loaded.deps, "dev");
    let peer_comp_deps = component_dep_list(&loaded.deps, "peer");
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
        "devDependencies": dev_comp_deps,
        "peerDependencies": peer_comp_deps,
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
    let dev_files = build_dev_files_map(loaded);
    json!([
        { "title": "id", "json": loaded.full_id() },
        { "title": "name", "json": loaded.entry.id.name },
        { "title": "scope", "json": loaded.scope },
        { "title": "package name", "json": loaded.component.package_name },
        { "title": "env", "json": loaded.component.env_id },
        { "title": "main file", "json": loaded.main_file },
        { "title": "files", "json": loaded.component.files },
        { "title": "dev files", "json": dev_files },
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
        format!("packageName: {}", loaded.component.package_name),
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

fn component_dep_list(deps: &[DepEntry], lifecycle: &str) -> Vec<Value> {
    deps.iter()
        .filter(|dep| dep.lifecycle == lifecycle && dep.dep_type == "component")
        .map(|dep| {
            json!({
                "id": dep.id,
                "relativePaths": dep.relative_paths,
                "packageName": dep.package_name,
            })
        })
        .collect()
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
    let mut has_dev_files = false;
    let mut out = Vec::new();
    for (ext_id, ext_cfg) in &loaded.component.config {
        let bare = aspect_id_without_version(ext_id);
        let is_dep_res = bare == DEPENDENCY_RESOLVER_ASPECT;
        if is_dep_res {
            has_dep_resolver = true;
        }
        if bare == DEV_FILES_ASPECT {
            has_dev_files = true;
        }
        let data = resolve_extension_data(loaded, bare, is_dep_res, &deps_json);
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
    if !has_dev_files && has_any_dev_files(loaded) {
        out.push(format_extension_entry(
            DEV_FILES_ASPECT,
            &json!({}),
            &json!({ "devFiles": build_dev_files_map(loaded) }),
            legacy,
        ));
    }
    append_unlisted_model_extensions(loaded, legacy, &mut out);
    out
}

fn resolve_extension_data(
    loaded: &LoadedComponent,
    bare_id: &str,
    is_dep_res: bool,
    deps_json: &[Value],
) -> Value {
    if is_dep_res {
        return json!({ "dependencies": deps_json });
    }
    if bare_id == DEV_FILES_ASPECT {
        return json!({ "devFiles": build_dev_files_map(loaded) });
    }
    find_model_ext_data(&loaded.model_extensions, bare_id).unwrap_or_else(|| json!({}))
}

fn find_model_ext_data(model_exts: &[Value], bare_id: &str) -> Option<Value> {
    model_exts
        .iter()
        .find_map(|ext| {
            let name = ext_id_str(ext)?;
            (aspect_id_without_version(name) == bare_id)
                .then(|| ext.get("data").cloned())
                .flatten()
        })
}

fn append_unlisted_model_extensions(loaded: &LoadedComponent, legacy: bool, out: &mut Vec<Value>) {
    for ext in &loaded.model_extensions {
        let Some(name) = ext_id_str(ext) else {
            continue;
        };
        let bare = aspect_id_without_version(name);
        let already_present = out
            .iter()
            .any(|existing| {
                existing["name"]
                    .as_str()
                    .is_some_and(|existing_name| aspect_id_without_version(existing_name) == bare)
            });
        if !already_present {
            let cfg = ext.get("config").unwrap_or(&Value::Null);
            let data = ext.get("data").unwrap_or(&Value::Null);
            out.push(format_extension_entry(name, cfg, data, legacy));
        }
    }
}

fn has_any_dev_files(loaded: &LoadedComponent) -> bool {
    let is_readme = aspect_id_without_version(&loaded.component.env_id) == "teambit.mdx/readme";
    is_readme
        || loaded.component.files
            .iter()
            .any(|file| {
                file.contains(".spec.")
                    || file.contains(".test.")
                    || file.contains(".docs.")
                    || file.contains(".composition.")
                    || file.contains(".compositions.")
            })
}

fn build_dev_files_map(loaded: &LoadedComponent) -> Value {
    let tester = matching_files(&loaded.component.files, |file| {
        file.contains(".spec.") || file.contains(".test.")
    });
    let is_readme = aspect_id_without_version(&loaded.component.env_id) == "teambit.mdx/readme";
    let mut docs =
        matching_files(&loaded.component.files, |file| !is_readme && file.contains(".docs."));
    let compositions = matching_files(&loaded.component.files, |file| {
        file.contains(".composition.") || file.contains(".compositions.")
    });
    if is_readme && !loaded.main_file.is_empty() {
        docs.push(Value::String(loaded.main_file.clone()));
    }
    json!({
        "teambit.defender/tester": tester,
        "teambit.docs/docs": docs,
        "teambit.compositions/compositions": compositions,
    })
}

fn matching_files(files: &[String], predicate: impl Fn(&str) -> bool) -> Vec<Value> {
    files
        .iter()
        .filter(|file| predicate(file))
        .cloned()
        .map(Value::String)
        .collect()
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
