//! Native `bit eject <component-pattern>` (`scopes/workspace/eject/eject-cmd.ts`).

pub(super) mod lane;

pub(super) use self::lane::eject_from_lane;

#[cfg(test)]
mod tests;

use super::{
    Command,
    aspect::write_bitmap_if_changed,
    color::Chalk,
    snap_distance::is_component_staged_on_main,
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
    if env::var_os("CI").is_some_and(|val| !val.is_empty()) {
        return Ok(Outcome::Declined("CI eject delegated".into()));
    }
    let cwd = env::current_dir()?;
    let Some(root) = workspace::root(&cwd) else {
        return workspace_command::execute_failure_scope(
            &cwd,
            args,
            "eject",
            options.json,
            "",
            io::Error::other("Cannot read properties of undefined (reading 'idsByPattern')"),
        );
    };
    if let Ok(Some(err_msg)) = validate_workspace(&root, &options.pattern) {
        return super::lint_cmd::emit_pattern_error(&root, args, "eject", options.json, err_msg);
    }
    if options.json {
        return Ok(Outcome::Declined("json eject delegated".into()));
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
    let mut options = Options {
        pattern: String::new(),
        force: false,
        skip_dependency_installation: false,
        json: false,
        keep_files: false,
    };
    let mut iter = args.iter().copied();
    while let Some(arg) = iter.next() {
        match arg {
            "--" => {
                consume_trailing_eject(iter, &mut options.pattern)?;
                break;
            }
            "--no-color" => {}
            "-f" | "--force" | "--force=true" => options.force = true,
            "--force=false" => options.force = false,
            "-x" | "--skip-dependency-installation" | "--skip-dependency-installation=true" => {
                options.skip_dependency_installation = true;
            }
            "--skip-dependency-installation=false" => options.skip_dependency_installation = false,
            "-j" | "--json" | "--json=true" => options.json = true,
            "--json=false" => options.json = false,
            "--keep-files" | "--keep-files=true" => options.keep_files = true,
            "--keep-files=false" => options.keep_files = false,
            val if !val.starts_with('-') && !val.is_empty() && options.pattern.is_empty() => {
                val.clone_into(&mut options.pattern);
            }
            val => apply_short_eject_flags(val, &mut options)?,
        }
    }
    (!options.pattern.is_empty()).then_some(options)
}

pub(super) fn consume_trailing_eject<'a>(
    iter: impl Iterator<Item = &'a str>,
    pattern: &mut String,
) -> Option<()> {
    for val in iter {
        (!val.is_empty() && !val.starts_with('-') && pattern.is_empty()).then_some(())?;
        val.clone_into(pattern);
    }
    Some(())
}

fn apply_short_eject_flags(arg: &str, options: &mut Options) -> Option<()> {
    let flags = arg.strip_prefix('-')?;
    if flags.is_empty() || flags.starts_with('-') {
        return None;
    }
    for ch in flags.chars() {
        match ch {
            'f' => options.force = true,
            'x' => options.skip_dependency_installation = true,
            'j' => options.json = true,
            _ => return None,
        }
    }
    Some(())
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

#[derive(Default)]
struct EjectSummary {
    ejected: Vec<String>,
    modified: Vec<String>,
    staged: Vec<String>,
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
    let mut summary = EjectSummary::default();
    for id in ids {
        eject_one_component(root, options, &mut bitmap, remotes, id, &mut summary)?;
    }
    if !summary.ejected.is_empty() {
        write_bitmap_if_changed(root, &bitmap_before, &bitmap, true, "eject")?;
        let _ = fs::remove_dir_all(deps_dir(root));
    }
    Ok(format_eject_template(&summary, chalk))
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
    if scope.is_empty() || version.is_empty() {
        summary.not_exported.push(id.to_owned());
        return Ok(());
    }
    if !scope.contains('.') || remotes.is_some_and(|map| map.contains_key(scope)) {
        summary.self_hosted.push(id.to_owned());
        return Ok(());
    }
    if !options.force && check_modified_or_staged(root, &row, scope, name, version, id, summary) {
        return Ok(());
    }
    eject_hub_package_and_untrack(root, options, bitmap, &key, &row, scope, name)?;
    summary.ejected.push(id.to_owned());
    Ok(())
}

fn eject_hub_package_and_untrack(
    root: &Path,
    options: &Options,
    bitmap: &mut Value,
    key: &str,
    row: &Value,
    scope: &str,
    name: &str,
) -> io::Result<()> {
    let version = row["version"].as_str().unwrap_or_default();
    let root_dir = row["rootDir"].as_str().unwrap_or_default();
    let main_file = row["mainFile"].as_str().unwrap_or("index.js");
    let pkg_name = pkg_name_for(scope, name);
    remove_nm_pkg(root, &pkg_name);
    if !options.skip_dependency_installation && root_dir != "." {
        add_dependency_to_workspace_jsonc(root, &pkg_name, version)?;
        materialize_ejected_package(root, &pkg_name, scope, name, version, main_file, root_dir)?;
    }
    if let Some(obj) = bitmap.as_object_mut() {
        obj.remove(key);
    }
    if !options.keep_files && !root_dir.is_empty() && root_dir != "." {
        let _ = fs::remove_dir_all(root.join(root_dir));
    }
    Ok(())
}

fn check_modified_or_staged(
    root: &Path,
    row: &Value,
    scope: &str,
    name: &str,
    version: &str,
    id: &str,
    summary: &mut EjectSummary,
) -> bool {
    if lane::is_hub_component_modified(root, row, scope, name, version) == Some(true) {
        summary.modified.push(id.to_owned());
        return true;
    }
    if is_component_staged_on_main(root, scope, name, version) == Some(true) {
        summary.staged.push(id.to_owned());
        return true;
    }
    false
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

fn format_eject_template(summary: &EjectSummary, chalk: Chalk) -> String {
    use std::fmt::Write;
    let mut out = String::new();
    if !summary.ejected.is_empty() {
        let list = chalk.bold(&summary.ejected.join(", "));
        out.push_str(&chalk.green(&format!(
            "successfully ejected the following components {list}\n",
        )));
    }
    let failure_body = build_failure_body(summary, chalk);
    if !failure_body.is_empty() {
        let title = chalk.red("failed to eject the following components\n");
        let _ = write!(out, "{}{}", chalk.underline(&title), chalk.red(&failure_body));
    }
    out
}

fn build_failure_body(summary: &EjectSummary, chalk: Chalk) -> String {
    use std::fmt::Write;
    let mut body = String::new();
    if !summary.modified.is_empty() {
        let _ = writeln!(
            body,
            "stopped the eject process for the following components because they have local changes.\n{}\nejecting modified components discards all local, unstaged, changes.\nuse 'bit diff <component id>' to see the changes and decide if to 'bit tag' them or not.\nuse the '--force' flag to discard local modifications and proceed with the eject process.",
            chalk.bold(&summary.modified.join(", ")),
        );
    }
    if !summary.staged.is_empty() {
        let _ = writeln!(
            body,
            "components with local versions (use --force to ignore): {}",
            summary.staged.join(", "),
        );
    }
    if !summary.not_exported.is_empty() {
        let _ = writeln!(
            body,
            "local components that were not exported yet: {}",
            summary.not_exported.join(", "),
        );
    }
    if !summary.self_hosted.is_empty() {
        let _ = writeln!(
            body,
            "components that were exported to a self hosted scope (not bit.cloud): {}",
            summary.self_hosted.join(", "),
        );
    }
    body
}
