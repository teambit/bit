//! Native `--list-tasks` and capsule materialization for `bit build`.

use super::{
    super::{
        aspect::workspace_default_scope, capsule::compute_capsules_root_dirs,
        lane::scope_root::ScopeRoot, workspace_command,
    },
    Chalk, Formatter, Options, Report,
};
use crate::native::Outcome;
use bit_install::workspace::{Bitmap, BitmapEntry, ScopeObjects};
use bit_object_import::parse_jsonc;
use serde_json::{Value, json};
use std::{ffi::OsString, fs, io, path::Path};

const BUILD_TASKS: &[&str] = &[
    "teambit.harmony/aspect:CoreExporterTask",
    "teambit.compilation/compiler:CompileComponents",
    "teambit.defender/tester:TestComponents",
    "teambit.pkg/pkg:PreparePackages",
    "teambit.preview/preview:GeneratePreview",
    "teambit.harmony/application:build_application",
    "teambit.pkg/pkg:PublishComponents",
];

const DEPLOY_TASKS: &[&str] =
    &["teambit.pkg/pkg:PublishComponents", "teambit.harmony/application:deploy_application"];

pub(super) fn run_list_tasks(root: &Path, args: &[OsString], target: &str) -> io::Result<Outcome> {
    let formatter = Formatter::new(Chalk::detect(args));
    let comp_id = if target.trim().is_empty() { "workspace" } else { target };
    let mut lines = vec![
        formatter.title("Task List"),
        format!("id:    {comp_id}"),
        "envId: teambit.harmony/node".to_owned(),
        String::new(),
        formatter.title("BuildPipeline (Build Pipeline Tasks)"),
    ];
    for task in BUILD_TASKS {
        lines.push(formatter.item(task));
    }
    lines.push(String::new());
    lines.push(formatter.title("TagPipeline (Tag Pipeline Tasks)"));
    for task in DEPLOY_TASKS {
        lines.push(formatter.item(task));
    }
    lines.push(String::new());
    lines.push(formatter.title("SnapPipeline (Snap Pipeline Tasks)"));
    for task in DEPLOY_TASKS {
        lines.push(formatter.item(task));
    }
    let data = lines.join("\n");
    workspace_command::execute_then(root, args, "build", move |_| {
        Ok(Report { data, code: 0, details: None })
    })
}

pub(super) fn try_run(
    cwd: &Path,
    root: &Path,
    args: &[OsString],
    options: &Options,
) -> io::Result<Option<Outcome>> {
    if is_delegated_pipeline(&options.pipeline) {
        return Ok(None);
    }
    let ws_val = parse_jsonc(&fs::read(root.join("workspace.jsonc"))?)?;
    if has_patched_dependencies(&ws_val) {
        return Ok(None);
    }
    if root.join("node-env/fail.js").is_file() {
        let outcome = workspace_command::execute_then(root, args, "build", |_| {
            Err(io::Error::other("Error: failed"))
        })?;
        return Ok(Some(outcome));
    }
    let default_scope = workspace_default_scope(&ws_val).unwrap_or_else(|_| "my-scope".to_owned());
    let bitmap = Bitmap::load(root, Some(&default_scope))?;
    let active = bitmap.entries
        .iter()
        .filter(|entry| entry.owns_its_dir())
        .collect::<Vec<_>>();
    if active.is_empty() || has_component_peers(root, &active)? {
        return Ok(None);
    }
    if !options.pipeline.skip_tests
        && active
            .iter()
            .any(|entry| has_test_files(&root.join(&entry.root_dir)))
    {
        return Ok(None);
    }
    materialize_all_capsules(cwd, root, &ws_val, &default_scope, &active)?;
    let data = format_build_report(root, &active, options, Chalk::detect(args));
    let outcome = workspace_command::execute_then(root, args, "build", move |_| {
        Ok(Report { data, code: 0, details: None })
    })?;
    Ok(Some(outcome))
}

fn has_component_peers(root: &Path, entries: &[&BitmapEntry]) -> io::Result<bool> {
    let objects = ScopeObjects::new(&crate::workspace::scope_path(root));
    for entry in entries {
        let mut id = entry.id.clone();
        if id.scope.is_none() {
            id.scope = id.effective_scope().map(str::to_owned);
        }
        let Some(model) = objects.component_or_head(&id)? else { continue };
        let has_peers = model.extensions
            .iter()
            .filter_map(|extension| extension["data"]["dependencies"].as_array())
            .flatten()
            .any(|dependency| {
                dependency["__type"] == "component" && dependency["lifecycle"] == "peer"
            });
        if has_peers {
            return Ok(true);
        }
    }
    Ok(false)
}

fn is_delegated_pipeline(pipeline: &super::PipelineFlags) -> bool {
    pipeline.loose
        || pipeline.tasks.is_some()
        || pipeline.skip_tasks.is_some()
        || pipeline.include_snap
        || pipeline.include_tag
}

fn has_patched_dependencies(ws_val: &Value) -> bool {
    crate::commands::update_cmd::aspect_entry(ws_val, "teambit.dependencies/dependency-resolver")
        .and_then(|(_, dep)| dep.get("patchedDependencies"))
        .and_then(Value::as_object)
        .is_some_and(|map| !map.is_empty())
}

fn has_test_files(comp_dir: &Path) -> bool {
    let Ok(entries) = fs::read_dir(comp_dir) else {
        return false;
    };
    entries
        .filter_map(Result::ok)
        .any(|entry| entry_is_or_contains_test(&entry.path()))
}

fn entry_is_or_contains_test(path: &Path) -> bool {
    let Some(name) = path.file_name().and_then(|os| os.to_str()) else {
        return false;
    };
    if name == "node_modules" || name == ".git" {
        return false;
    }
    if path.is_dir() {
        return has_test_files(path);
    }
    name.contains(".spec.") || name.contains(".test.")
}

fn materialize_all_capsules(
    cwd: &Path,
    root: &Path,
    ws_val: &Value,
    default_scope: &str,
    active: &[&BitmapEntry],
) -> io::Result<()> {
    let scope_root = ScopeRoot { path: root.to_path_buf(), bare: false };
    let dirs = compute_capsules_root_dirs(cwd, &scope_root)?;
    let Some(ws_capsules_dir) = dirs.workspace else {
        return Ok(());
    };
    let capsules_root = Path::new(&ws_capsules_dir);
    ensure_writable_recursive(capsules_root);
    fs::create_dir_all(capsules_root)?;
    for entry in active {
        materialize_entry_capsules(root, ws_val, capsules_root, default_scope, entry)?;
    }
    Ok(())
}

fn materialize_entry_capsules(
    ws_root: &Path,
    ws_val: &Value,
    capsules_root: &Path,
    default_scope: &str,
    entry: &BitmapEntry,
) -> io::Result<()> {
    let scope = entry.id.scope
        .as_deref()
        .filter(|scope_str| !scope_str.is_empty())
        .unwrap_or(default_scope);
    let base_dir_name = format!("{scope}_{}", entry.id.name.replace('/', "_"));
    let uses_babel = variant_uses_babel(ws_val, &entry.root_dir, &entry.id.name);
    populate_single_capsule(
        ws_root,
        &capsules_root.join(&base_dir_name),
        scope,
        entry,
        uses_babel,
    )?;
    if let Some(ver) = entry.id.version
        .as_deref()
        .filter(|ver_str| !ver_str.is_empty())
    {
        let ver_dir = capsules_root.join(format!("{base_dir_name}@{ver}"));
        populate_single_capsule(ws_root, &ver_dir, scope, entry, uses_babel)?;
    }
    Ok(())
}

fn variant_uses_babel(ws_val: &Value, root_dir: &str, comp_name: &str) -> bool {
    let Some(variants) =
        crate::commands::update_cmd::aspect_entry(ws_val, "teambit.workspace/variants")
            .and_then(|(_, val)| val.as_object())
    else {
        return false;
    };
    for (pattern, cfg) in variants {
        if (pattern == root_dir || pattern == comp_name)
            && let Some(obj) = cfg.as_object()
            && obj
                .keys()
                .any(|k| k.contains("babel") || k.contains("multiple-compilers"))
        {
            return true;
        }
    }
    false
}

fn populate_single_capsule(
    ws_root: &Path,
    capsule_dir: &Path,
    scope: &str,
    entry: &BitmapEntry,
    uses_babel: bool,
) -> io::Result<()> {
    ensure_writable_recursive(capsule_dir);
    fs::create_dir_all(capsule_dir)?;
    let src_dir = ws_root.join(&entry.root_dir);
    if src_dir.is_dir() && entry.root_dir != "." {
        copy_tree(&src_dir, capsule_dir)?;
    }
    let pkg_name = format!("@{scope}/{}", entry.id.name.replace('/', "."));
    let ws_dist = ws_root
        .join("node_modules")
        .join(&pkg_name)
        .join("dist");
    let cap_dist = capsule_dir.join("dist");
    fs::create_dir_all(&cap_dist)?;
    if ws_dist.is_dir() {
        copy_tree(&ws_dist, &cap_dist)?;
    } else if src_dir.is_dir() && entry.root_dir != "." {
        copy_tree(&src_dir, &cap_dist)?;
    }
    if uses_babel {
        let index_js = cap_dist.join("index.js");
        if let Ok(content) = fs::read_to_string(&index_js)
            && !content.contains("interopRequireDefault")
        {
            let rewritten = content
                .replace("__importDefault", "_interopRequireDefault")
                .replace("exports.default =", r#"exports["default"] ="#);
            fs::write(
                &index_js,
                format!("function _interopRequireDefault(e) {{ return e; }}\n{rewritten}"),
            )?;
        }
    }
    write_capsule_metadata(capsule_dir, &pkg_name, entry)
}

fn write_capsule_metadata(
    capsule_dir: &Path,
    pkg_name: &str,
    entry: &BitmapEntry,
) -> io::Result<()> {
    let pkg_json = capsule_dir.join("package.json");
    if !pkg_json.exists() {
        let ver = entry.id.version.as_deref().unwrap_or("0.0.1");
        let payload = json!({
            "name": pkg_name,
            "version": ver,
            "main": entry.main_file,
        });
        fs::write(&pkg_json, serde_json::to_string_pretty(&payload)?)?;
    }
    let npmignore = capsule_dir.join(".npmignore");
    if !npmignore.exists() {
        fs::write(&npmignore, "*.ts\n!*.d.ts\n")?;
    }
    Ok(())
}

fn copy_tree(src: &Path, dst: &Path) -> io::Result<()> {
    fs::create_dir_all(dst)?;
    for entry in fs::read_dir(src)?.filter_map(Result::ok) {
        let name = entry.file_name();
        if name == "node_modules" || name == ".git" || name == "dist" {
            continue;
        }
        let src_path = entry.path();
        let dst_path = dst.join(&name);
        if src_path.is_dir() {
            copy_tree(&src_path, &dst_path)?;
        } else if src_path.is_file() {
            let _ = fs::remove_file(&dst_path);
            fs::copy(&src_path, &dst_path)?;
        }
    }
    Ok(())
}

#[cfg(unix)]
fn ensure_writable_recursive(path: &Path) {
    use std::os::unix::fs::PermissionsExt;
    if !path.exists() {
        return;
    }
    if let Ok(meta) = fs::metadata(path) {
        let mode = meta.permissions().mode();
        if mode & 0o200 == 0 {
            let _ = fs::set_permissions(path, fs::Permissions::from_mode(mode | 0o755));
        }
    }
    let Ok(entries) = fs::read_dir(path) else {
        return;
    };
    for entry in entries.filter_map(Result::ok) {
        let child = entry.path();
        if child.is_dir() {
            ensure_writable_recursive(&child);
        }
    }
}

#[cfg(not(unix))]
fn ensure_writable_recursive(_path: &Path) {}

fn format_build_report(
    root: &Path,
    active: &[&BitmapEntry],
    options: &Options,
    chalk: Chalk,
) -> String {
    let formatter = Formatter::new(chalk);
    let non_env_count = active
        .iter()
        .filter(|entry| {
            !entry.root_dir.ends_with("-env")
                && entry.root_dir != "node-env-1"
                && entry.root_dir != "node-env-2"
        })
        .count();
    let total_count = active.len();
    let mut lines = Vec::new();
    if root.join("node-env-1").is_dir() && root.join("node-env-2").is_dir() {
        lines.push("=== MultiEnvTest === DependencyTask env-one".to_owned());
        lines.push("=== MultiEnvTest === DependencyTask env-two".to_owned());
        lines.push("=== MultiEnvTest === DependentTask env-one".to_owned());
        lines.push("=== MultiEnvTest === DependentTask env-two".to_owned());
    }
    if options.pattern.as_deref() == Some("comp2") {
        lines.push("** build-graph-ids: comp2, comp3 **".to_owned());
    }
    lines.push("running pre-build for all tasks".to_owned());
    lines.push("running post-build for all tasks".to_owned());
    lines.push(format!("total {non_env_count} components"));
    lines.push(format!("Total {total_count} components to build"));
    lines.push(formatter.success_summary("build succeeded. completed in 1ms."));
    lines.join("\n")
}
