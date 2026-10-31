//! Native `bit local-only <set|unset|list> [component-pattern]` (`LocalOnlyCmd` in `scopes/workspace/workspace/commands/local-only-cmd.ts`).

#[cfg(test)]
mod tests;

use super::{
    Command,
    color::Chalk,
    scope_set::{Failure, selection},
    workspace_command::{self, results::Report},
};
use crate::{native::Outcome, workspace};
use bit_install::workspace::{Bitmap, BitmapEntry};
use serde_json::{Value, json};
use std::{
    env,
    ffi::OsString,
    fs, io,
    path::{Path, PathBuf},
};

pub const COMMAND: Command = Command { name: "local-only", aliases: &[], run };

#[derive(Debug, Clone, PartialEq, Eq)]
enum Subcommand {
    Set(String),
    Unset(String),
    List,
    Unrecognized(String),
}

enum Prepared {
    Set { root: PathBuf, ids: Vec<String>, bitmap_before: Vec<u8>, bitmap_val: Value },
    Unset { root: PathBuf, unset_ids: Vec<String>, bitmap_before: Vec<u8>, bitmap_val: Value },
    List { ids: Vec<String> },
    Unrecognized { sub: String },
}

fn run(args: &[OsString]) -> io::Result<Outcome> {
    let Some(subcommand) = parse_subcommand(args) else {
        return Ok(Outcome::Declined(
            "arguments outside the native `local-only` grammar".to_owned(),
        ));
    };
    let cwd = env::current_dir()?;
    let label = subcommand.loader_label();
    let Some(root) = workspace::root(&cwd) else {
        if env::var_os("CI").is_some_and(|value| !value.is_empty()) {
            return Ok(Outcome::Declined("CI local-only error stack".to_owned()));
        }
        return workspace_command::execute_failure_scope(
            &cwd,
            args,
            label,
            false,
            "",
            io::Error::other(crate::commands::log::OUTSIDE_WORKSPACE_ERR),
        );
    };
    let chalk = Chalk::detect(args);
    match prepare(&root, &subcommand, chalk) {
        Ok(prepared) => {
            workspace_command::execute_then(&root, args, label, |_output| prepared.commit(chalk))
        }
        Err(Failure::User(message)) => {
            if env::var_os("CI").is_some_and(|value| !value.is_empty()) {
                return Ok(Outcome::Declined("CI local-only error stack".to_owned()));
            }
            workspace_command::execute_then(&root, args, label, |_output| {
                Err(io::Error::other(message))
            })
        }
        Err(Failure::Declined(reason)) => Ok(Outcome::Declined(format!("local-only: {reason}"))),
    }
}

impl Subcommand {
    const fn loader_label(&self) -> &'static str {
        match self {
            Self::Set(_) => "set",
            Self::Unset(_) => "unset",
            Self::List => "list",
            Self::Unrecognized(_) => "local-only",
        }
    }
}

fn parse_subcommand(args: &[OsString]) -> Option<Subcommand> {
    let tokens = args
        .iter()
        .skip(1)
        .map(|arg| arg.to_str())
        .collect::<Option<Vec<_>>>()?;
    let filtered = super::scope_set::collect_non_flag_tokens(&tokens)?;
    match filtered.as_slice() {
        ["list"] => Some(Subcommand::List),
        ["set", pattern] if is_supported_pattern(pattern) => {
            Some(Subcommand::Set((*pattern).to_owned()))
        }
        ["unset", pattern] if is_supported_pattern(pattern) => {
            Some(Subcommand::Unset((*pattern).to_owned()))
        }
        [sub] if !sub.starts_with('-') && !matches!(*sub, "set" | "unset" | "list") => {
            Some(Subcommand::Unrecognized((*sub).to_owned()))
        }
        _ => None,
    }
}

fn is_supported_pattern(pattern: &str) -> bool {
    !pattern.is_empty()
        && !pattern.starts_with(['-', '@'])
        && !pattern.contains(['$', ':'])
        && !pattern.contains(" AND ")
}

fn prepare(root: &Path, subcommand: &Subcommand, chalk: Chalk) -> Result<Prepared, Failure> {
    if let Subcommand::Unrecognized(sub) = subcommand {
        return Ok(Prepared::Unrecognized { sub: sub.clone() });
    }
    let workspace_bytes = fs::read(root.join("workspace.jsonc"))?;
    let bitmap_before = fs::read(root.join(".bitmap"))?;
    let workspace_val = bit_object_import::parse_jsonc(&workspace_bytes)?;
    let bitmap_val = bit_object_import::parse_jsonc(&bitmap_before)?;
    let default_scope = workspace_default_scope(&workspace_val)?;
    let bitmap = Bitmap::load(root, Some(&default_scope))?;
    match subcommand {
        Subcommand::Set(pattern) => {
            prepare_set(root, &bitmap, pattern, bitmap_before, bitmap_val, chalk)
        }
        Subcommand::Unset(pattern) => {
            prepare_unset(root, &bitmap, pattern, bitmap_before, bitmap_val, chalk)
        }
        Subcommand::List => Ok(prepare_list(&bitmap, &bitmap_val)),
        Subcommand::Unrecognized(sub) => Ok(Prepared::Unrecognized { sub: sub.clone() }),
    }
}

fn workspace_default_scope(workspace: &Value) -> Result<String, Failure> {
    let rows = workspace
        .as_object()
        .ok_or_else(|| Failure::Declined("workspace.jsonc object".to_owned()))?;
    let key = rows
        .keys()
        .find(|key| key.split('@').next() == Some("teambit.workspace/workspace"))
        .cloned()
        .unwrap_or_else(|| "teambit.workspace/workspace".to_owned());
    let ws = &workspace[&key];
    if ws["bitmapAutoSync"] == true {
        return Err(Failure::Declined("bitmapAutoSync enabled".to_owned()));
    }
    ws["defaultScope"]
        .as_str()
        .filter(|scope| !scope.is_empty())
        .map(str::to_owned)
        .ok_or_else(|| Failure::Declined("missing defaultScope".to_owned()))
}

fn prepare_set(
    root: &Path,
    bitmap: &Bitmap,
    pattern: &str,
    bitmap_before: Vec<u8>,
    mut bitmap_val: Value,
    chalk: Chalk,
) -> Result<Prepared, Failure> {
    let matched = selection::resolve_pattern_entries(root, bitmap, pattern, chalk)?;
    let mut staged = Vec::new();
    for entry in &matched {
        if is_entry_staged_for_local_only(root, &bitmap_val, entry)? {
            staged.push(selection::entry_full_id(entry));
        }
    }
    if !staged.is_empty() {
        return Err(Failure::User(format!(
            "unable to set the following component(s) as local-only because they have local snaps/tags: {}",
            staged.join(", "),
        )));
    }
    let mut ids = Vec::with_capacity(matched.len());
    for entry in matched {
        let row = find_bitmap_row_mut(&mut bitmap_val, entry)?;
        row["localOnly"] = json!(true);
        ids.push(selection::entry_full_id(entry));
    }
    Ok(Prepared::Set { root: root.to_path_buf(), ids, bitmap_before, bitmap_val })
}

fn is_entry_staged_for_local_only(
    root: &Path,
    bitmap_val: &Value,
    entry: &BitmapEntry,
) -> Result<bool, Failure> {
    let Some(version) = entry.id.version
        .as_deref()
        .filter(|ver| !ver.is_empty())
    else {
        return Ok(false);
    };
    let row = find_bitmap_row_ref(bitmap_val, entry)?;
    let Some(scope) = row["scope"]
        .as_str()
        .filter(|scope| !scope.is_empty())
    else {
        return Ok(true);
    };
    if entry.root_dir.is_empty() || !root.join(&entry.root_dir).is_dir() {
        return Err(Failure::Declined("exported component directory missing".to_owned()));
    }
    if !bitmap_val["_bit_lane"].is_null() && bitmap_val["_bit_lane"]["id"]["name"] != "main" {
        return super::snap_distance::is_component_staged_on_lane(
            root,
            bitmap_val,
            scope,
            &entry.id.name,
            version,
        )
        .ok_or_else(|| Failure::Declined("exported component on a lane".to_owned()));
    }
    super::snap_distance::is_component_staged_on_main(root, scope, &entry.id.name, version)
        .ok_or_else(|| Failure::Declined("exported versioned component".to_owned()))
}

fn prepare_unset(
    root: &Path,
    bitmap: &Bitmap,
    pattern: &str,
    bitmap_before: Vec<u8>,
    mut bitmap_val: Value,
    chalk: Chalk,
) -> Result<Prepared, Failure> {
    let matched = selection::resolve_pattern_entries(root, bitmap, pattern, chalk)?;
    let mut unset_ids = Vec::new();
    for entry in matched {
        let row = find_bitmap_row_mut(&mut bitmap_val, entry)?;
        if row["localOnly"].as_bool() == Some(true) {
            if let Some(obj) = row.as_object_mut() {
                obj.remove("localOnly");
            }
            unset_ids.push(selection::entry_full_id(entry));
        }
    }
    Ok(Prepared::Unset { root: root.to_path_buf(), unset_ids, bitmap_before, bitmap_val })
}

fn prepare_list(bitmap: &Bitmap, bitmap_val: &Value) -> Prepared {
    let ids = bitmap.entries
        .iter()
        .filter(|entry| entry.owns_its_dir())
        .filter(|entry| {
            find_bitmap_row_ref(bitmap_val, entry)
                .is_ok_and(|row| row["localOnly"].as_bool() == Some(true))
        })
        .map(selection::entry_full_id)
        .collect::<Vec<_>>();
    Prepared::List { ids }
}

fn find_bitmap_row_ref<'a>(
    bitmap_val: &'a Value,
    entry: &BitmapEntry,
) -> Result<&'a Value, Failure> {
    let rows =
        bitmap_val.as_object().ok_or_else(|| Failure::Declined("bitmap object".to_owned()))?;
    rows.iter()
        .find(|(key, row)| row_matches_entry(key, row, entry))
        .map(|(_, row)| row)
        .ok_or_else(|| Failure::Declined(format!("bitmap entry {}", entry.id.name)))
}

fn find_bitmap_row_mut<'a>(
    bitmap_val: &'a mut Value,
    entry: &BitmapEntry,
) -> Result<&'a mut Value, Failure> {
    let rows =
        bitmap_val.as_object_mut().ok_or_else(|| Failure::Declined("bitmap object".to_owned()))?;
    rows.iter_mut()
        .find(|(key, row)| row_matches_entry(key, row, entry))
        .map(|(_, row)| row)
        .ok_or_else(|| Failure::Declined(format!("bitmap entry {}", entry.id.name)))
}

fn row_matches_entry(key: &str, row: &Value, entry: &BitmapEntry) -> bool {
    if key.starts_with('$') || matches!(key, "_bit_lane" | "version") || !row.is_object() {
        return false;
    }
    if !entry.root_dir.is_empty() && row["rootDir"].as_str() == Some(entry.root_dir.as_str()) {
        return true;
    }
    let (row_scope, row_name) = super::update_cmd::bitmap_row_scope_and_name(key, row);
    let entry_scope = entry.id.scope
        .as_deref()
        .or(entry.id.default_scope.as_deref())
        .unwrap_or_default();
    row_name == entry.id.name
        && (row_scope.is_empty() || entry_scope.is_empty() || row_scope == entry_scope)
}

impl Prepared {
    fn commit(self, chalk: Chalk) -> io::Result<Report> {
        let data = match self {
            Self::Set { root, ids, bitmap_before, bitmap_val } => {
                persist_bitmap(&root, &bitmap_before, &bitmap_val, "setLocalOnly")?;
                format!(
                    "{}:\n{}",
                    chalk.bold("successfully set the following components as local-only"),
                    ids.join("\n"),
                )
            }
            Self::Unset { root, unset_ids, bitmap_before, bitmap_val } => {
                persist_bitmap(&root, &bitmap_before, &bitmap_val, "unsetLocalOnly")?;
                format_list(chalk, "successfully unset the following component(s)", &unset_ids)
            }
            Self::List { ids } => {
                format_list(chalk, "the following component(s) are local-only", &ids)
            }
            Self::Unrecognized { sub } => chalk.red(&format!(
                r#""{sub}" is not a subcommand of "local-only", please run "bit local-only --help" to list the subcommands"#,
            )),
        };
        Ok(Report { data, code: 0, details: None })
    }
}

fn persist_bitmap(root: &Path, before: &[u8], after: &Value, reason: &str) -> io::Result<()> {
    let file_id = workspace_command::file_id();
    bit_object_import::component_deprecation::write_bitmap(root, before, after, &file_id, reason)
}

fn format_list(chalk: Chalk, heading: &str, ids: &[String]) -> String {
    if ids.is_empty() {
        chalk.yellow("no local-only components were found")
    } else {
        format!("{}:\n{}", chalk.bold(heading), ids.join("\n"))
    }
}
