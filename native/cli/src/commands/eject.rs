//! Native `bit eject <component-pattern>` (`scopes/workspace/eject/eject-cmd.ts`).

#[cfg(test)]
mod tests;

use super::{
    Command,
    aspect::write_bitmap_if_changed,
    color::Chalk,
    workspace_command::{self, results::Report},
};
use crate::{native::Outcome, workspace};
use bit_install::{
    dependencies::cache::invalidation::deps_dir, model::ComponentId,
    workspace::component_package_name,
};
use bit_object_import::{component_remove::select_ids, parse_jsonc, scope_path};
use serde_json::{Map, Value, json};
use std::{env, ffi::OsString, fs, io, path::Path};

pub const COMMAND: Command = Command { name: "eject", aliases: &["E"], run };

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct Options {
    pub pattern: String,
    pub force: bool,
    pub skip_dependency_installation: bool,
    pub json: bool,
    pub keep_files: bool,
}

fn run(args: &[OsString]) -> io::Result<Outcome> {
    let Some(argv) = workspace_command::utf8_args(args) else {
        return Ok(Outcome::Declined("eject arguments are not UTF-8".into()));
    };
    let Some(options) = parse_options(&argv[1..]) else {
        return Ok(Outcome::Declined("outside native eject grammar".into()));
    };
    if options.json || env::var_os("CI").is_some_and(|val| !val.is_empty()) {
        return Ok(Outcome::Declined("CI/json eject delegated".into()));
    }
    let cwd = env::current_dir()?;
    let Some(root) = workspace::root(&cwd) else {
        return Ok(Outcome::Declined("eject outside workspace delegated".into()));
    };
    if let Ok(Some(err_msg)) = validate_workspace(&root, &options.pattern) {
        return workspace_command::execute_then(&root, args, "eject", |_| {
            Err(io::Error::other(err_msg))
        });
    }
    let ids = match select_ids(&root, &options.pattern) {
        Ok(ids) => ids,
        Err(err) => return Ok(Outcome::Declined(format!("eject selection: {err}"))),
    };
    let chalk = Chalk::detect(args);
    workspace_command::execute_then(&root, args, "eject", |_| {
        let data = execute_eject(&root, &options, &ids, chalk)?;
        Ok(Report { data, code: 0, details: None })
    })
}

pub(super) fn parse_options(args: &[&str]) -> Option<Options> {
    let mut pattern = None;
    let mut force = false;
    let mut skip_dependency_installation = false;
    let mut json = false;
    let mut keep_files = false;
    for &arg in args {
        match arg {
            "--no-color" => {}
            "-f" | "--force" => force = true,
            "-x" | "--skip-dependency-installation" => skip_dependency_installation = true,
            "-j" | "--json" => json = true,
            "--keep-files" => keep_files = true,
            val if !val.starts_with('-') && !val.is_empty() && pattern.is_none() => {
                pattern = Some(val.to_owned());
            }
            _ => return None,
        }
    }
    Some(Options { pattern: pattern?, force, skip_dependency_installation, json, keep_files })
}

pub(super) fn validate_workspace(root: &Path, pattern: &str) -> io::Result<Option<String>> {
    match select_ids(root, pattern) {
        Ok(_) => {}
        Err(err) if err.kind() == io::ErrorKind::InvalidInput => {
            return Ok(Some(err.to_string()));
        }
        Err(err) => return Err(err),
    }
    let bitmap = parse_jsonc(&fs::read(root.join(".bitmap"))?)?;
    if !bitmap["_bit_lane"].is_null() && bitmap["_bit_lane"]["id"]["name"] != "main" {
        return Ok(Some(
            r#"unable to eject when the workspace is on a lane, please use "bit lane eject" to delete the component from the lane and install the main version"#
                .into(),
        ));
    }
    Ok(None)
}

struct EjectSummary {
    ejected: Vec<String>,
    not_exported: Vec<String>,
    self_hosted: Vec<String>,
}

fn execute_eject(
    root: &Path,
    options: &Options,
    ids: &[String],
    chalk: Chalk,
) -> io::Result<String> {
    let bitmap_before = fs::read(root.join(".bitmap"))?;
    let mut bitmap = parse_jsonc(&bitmap_before)?;
    let scope_json: Value = fs::read(scope_path(root).join("scope.json"))
        .ok()
        .and_then(|bytes| parse_jsonc(&bytes).ok())
        .unwrap_or_else(|| json!({}));
    let remotes = scope_json["remotes"].as_object();
    let mut summary =
        EjectSummary { ejected: Vec::new(), not_exported: Vec::new(), self_hosted: Vec::new() };
    for id in ids {
        eject_one_component(root, options, &mut bitmap, remotes, id, &mut summary)?;
    }
    if !summary.ejected.is_empty() {
        write_bitmap_if_changed(root, &bitmap_before, &bitmap, true, "eject")?;
        let _ = fs::remove_dir_all(deps_dir(root));
    }
    Ok(format_eject_template(&summary.ejected, &summary.not_exported, &summary.self_hosted, chalk))
}

fn eject_one_component(
    root: &Path,
    options: &Options,
    bitmap: &mut Value,
    remotes: Option<&serde_json::Map<String, Value>>,
    id: &str,
    summary: &mut EjectSummary,
) -> io::Result<()> {
    let Some((key, row)) = find_bitmap_row(bitmap, id) else { return Ok(()) };
    let name = row["name"].as_str().unwrap_or(&key);
    let scope = row["scope"].as_str().unwrap_or_default();
    let version = row["version"].as_str().unwrap_or_default();
    let root_dir = row["rootDir"].as_str().unwrap_or_default();
    let main_file = row["mainFile"].as_str().unwrap_or("index.js");
    if scope.is_empty() || version.is_empty() {
        summary.not_exported.push(id.to_owned());
        return Ok(());
    }
    if !scope.contains('.') || remotes.is_some_and(|map| map.contains_key(scope)) {
        summary.self_hosted.push(id.to_owned());
        return Ok(());
    }
    let pkg_name = pkg_name_for(scope, name);
    remove_nm_pkg(root, &pkg_name);
    if !options.skip_dependency_installation && root_dir != "." {
        add_dependency_to_workspace_jsonc(root, &pkg_name, version)?;
        materialize_ejected_package(root, &pkg_name, scope, name, version, main_file, root_dir)?;
    }
    if let Some(obj) = bitmap.as_object_mut() {
        obj.remove(&key);
    }
    if !options.keep_files && !root_dir.is_empty() && root_dir != "." {
        let _ = fs::remove_dir_all(root.join(root_dir));
    }
    summary.ejected.push(id.to_owned());
    Ok(())
}

pub(super) fn eject_from_lane(
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
    Ok(version_for_hash(&model["versions"], head_hash).unwrap_or_else(|| head_hash.to_owned()))
}

fn version_for_hash(versions: &Value, head_hash: &str) -> Option<String> {
    for (ver, hash) in versions.as_object()? {
        if hash.as_str() == Some(head_hash) {
            return Some(ver.clone());
        }
    }
    None
}

fn eject_one_lane_component(
    root: &Path,
    bitmap: &mut Value,
    id: &str,
    main_version: &str,
) -> io::Result<bool> {
    let Some((key, row)) = find_bitmap_row(bitmap, id) else { return Ok(false) };
    let name = row["name"].as_str().unwrap_or(&key);
    let scope = row["scope"]
        .as_str()
        .filter(|val| !val.is_empty())
        .or_else(|| row["defaultScope"].as_str())
        .unwrap_or_default();
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
    if bitmap[&key]["config"].is_null() {
        bitmap[&key]["config"] = json!({});
    }
    bitmap[&key]["config"]["teambit.component/remove"] = json!({ "removed": true });
    if !root_dir.is_empty() && root_dir != "." {
        let _ = fs::remove_dir_all(root.join(root_dir));
    }
    Ok(true)
}

fn find_bitmap_row(bitmap: &Value, id: &str) -> Option<(String, Value)> {
    let bare = id.split('@').next().unwrap_or(id);
    let rows = bitmap.as_object()?;
    for (key, row) in rows {
        if key == "$schema-version" || key == "_bit_lane" || !row.is_object() {
            continue;
        }
        let name = row["name"].as_str().unwrap_or(key);
        let scope = row["scope"]
            .as_str()
            .filter(|val| !val.is_empty())
            .or_else(|| row["defaultScope"].as_str())
            .unwrap_or_default();
        let full = if scope.is_empty() { name.to_owned() } else { format!("{scope}/{name}") };
        if full == bare || name == bare || key == bare {
            return Some((key.clone(), row.clone()));
        }
    }
    None
}

fn pkg_name_for(scope: &str, name: &str) -> String {
    let comp_id = ComponentId {
        scope: Some(scope.to_owned()),
        name: name.to_owned(),
        version: None,
        default_scope: None,
    };
    component_package_name(&comp_id, None, &Map::new())
}

fn remove_nm_pkg(root: &Path, pkg_name: &str) {
    let pkg_path = root.join("node_modules").join(pkg_name);
    if let Ok(meta) = fs::symlink_metadata(&pkg_path) {
        if meta.file_type().is_symlink() || meta.is_file() {
            let _ = fs::remove_file(&pkg_path);
        } else if meta.is_dir() {
            let _ = fs::remove_dir_all(&pkg_path);
        }
    }
}

fn add_dependency_to_workspace_jsonc(root: &Path, pkg_name: &str, version: &str) -> io::Result<()> {
    let path = root.join("workspace.jsonc");
    let before = fs::read(&path)?;
    let text = std::str::from_utf8(&before).map_err(io::Error::other)?;
    let mut doc = bit_workspace_config::jsonc::Document::parse(text)?;
    doc.set(
        &["teambit.dependencies/dependency-resolver", "policy", "dependencies", pkg_name],
        &json!(version),
    );
    fs::write(&path, format!("{doc}\n"))
}

fn materialize_ejected_package(
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

fn format_eject_template(
    ejected: &[String],
    not_exported: &[String],
    self_hosted: &[String],
    chalk: Chalk,
) -> String {
    use std::fmt::Write;
    let mut out = String::new();
    if !ejected.is_empty() {
        let list = chalk.bold(&ejected.join(", "));
        out.push_str(&chalk.green(&format!(
            "successfully ejected the following components {list}\n",
        )));
    }
    let mut failure_body = String::new();
    if !not_exported.is_empty() {
        let _ = writeln!(
            failure_body,
            "local components that were not exported yet: {}",
            not_exported.join(", "),
        );
    }
    if !self_hosted.is_empty() {
        let _ = writeln!(
            failure_body,
            "components that were exported to a self hosted scope (not bit.cloud): {}",
            self_hosted.join(", "),
        );
    }
    if !failure_body.is_empty() {
        let title = chalk.red("failed to eject the following components\n");
        let _ = write!(out, "{}{}", chalk.underline(&title), chalk.red(&failure_body));
    }
    out
}
