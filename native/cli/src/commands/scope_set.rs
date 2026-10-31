//! Native `bit scope set <scope-name> [component-pattern]` (`ScopeSetCmd`).

pub(in crate::commands) mod selection;
#[cfg(test)]
mod tests;

use super::{
    color::Chalk,
    workspace_command::{self, format::Formatter, results::Report},
};
use crate::{native::Outcome, workspace};
use bit_install::workspace::Bitmap;
use serde_json::{Value, json};
use std::{
    env,
    ffi::OsString,
    fs, io,
    path::{Path, PathBuf},
};

#[derive(Debug, Clone, PartialEq, Eq)]
struct Options {
    scope_name: String,
    pattern: Option<String>,
}

#[derive(Debug)]
pub(in crate::commands) enum Failure {
    Declined(String),
    User(String),
}

impl From<io::Error> for Failure {
    fn from(error: io::Error) -> Self {
        Self::Declined(error.to_string())
    }
}

struct WorkspacePlan {
    root: PathBuf,
    ws_key: String,
    old_scope: String,
    new_scope: String,
    workspace_before: Vec<u8>,
    bitmap_before: Vec<u8>,
    bitmap_val: Value,
    bitmap_changed: bool,
}

struct ComponentPlan {
    root: PathBuf,
    new_scope: String,
    changed_ids: Vec<String>,
    bitmap_before: Vec<u8>,
    bitmap_val: Value,
}

enum Prepared {
    Workspace(WorkspacePlan),
    Components(ComponentPlan),
}

pub(super) fn run(args: &[OsString]) -> io::Result<Outcome> {
    let Some(options) = parse_options(args) else {
        return Ok(
            Outcome::Declined("arguments outside the native `scope set` grammar".to_owned()),
        );
    };
    let Some(root) = workspace::root(&env::current_dir()?) else {
        return Ok(Outcome::Declined("scope set requires a workspace".to_owned()));
    };
    let chalk = Chalk::detect(args);
    match prepare(&root, &options, chalk) {
        Ok(prepared) => {
            workspace_command::execute_then(&root, args, "set", |_output| prepared.commit(chalk))
        }
        Err(Failure::User(message)) => {
            if env::var_os("CI").is_some_and(|value| !value.is_empty()) {
                return Ok(Outcome::Declined("CI scope set error stack".to_owned()));
            }
            workspace_command::execute_then(&root, args, "set", |_output| {
                Err(io::Error::other(message))
            })
        }
        Err(Failure::Declined(reason)) => Ok(Outcome::Declined(format!("scope set: {reason}"))),
    }
}

fn parse_options(args: &[OsString]) -> Option<Options> {
    let tokens = args
        .iter()
        .skip(1)
        .map(|arg| arg.to_str())
        .collect::<Option<Vec<_>>>()?
        .into_iter()
        .filter(|token| !matches!(*token, "--no-color" | "--no-color=true" | "--no-color=false"))
        .collect::<Vec<_>>();
    let (&"set", rest) = tokens.split_first()? else {
        return None;
    };
    let positional = collect_non_flag_tokens(rest)?;
    let (scope_name, pattern) = match positional.as_slice() {
        [scope] if !scope.is_empty() => ((*scope).to_owned(), None),
        [scope, pattern] if !scope.is_empty() && !pattern.is_empty() => {
            if pattern.contains(['$', ':', '@'])
                || pattern.contains(" AND ")
                || pattern.starts_with("teambit.")
            {
                return None;
            }
            ((*scope).to_owned(), Some((*pattern).to_owned()))
        }
        _ => return None,
    };
    Some(Options { scope_name, pattern })
}

pub(super) fn collect_non_flag_tokens<'a>(rest: &[&'a str]) -> Option<Vec<&'a str>> {
    let mut positional = Vec::new();
    let mut iter = rest.iter().copied();
    while let Some(token) = iter.next() {
        if token == "--" {
            return collect_trailing(&mut positional, iter).then_some(positional);
        }
        if matches!(token, "--no-color" | "--no-color=true" | "--no-color=false") {
            continue;
        }
        if token.is_empty() || token.starts_with('-') {
            return None;
        }
        positional.push(token);
    }
    Some(positional)
}

fn collect_trailing<'a>(
    positional: &mut Vec<&'a str>,
    iter: impl Iterator<Item = &'a str>,
) -> bool {
    for trailing in iter {
        if trailing.starts_with('-') || trailing.is_empty() {
            return false;
        }
        positional.push(trailing);
    }
    true
}

fn prepare(root: &Path, options: &Options, chalk: Chalk) -> Result<Prepared, Failure> {
    let workspace_before = fs::read(root.join("workspace.jsonc"))?;
    let bitmap_before = fs::read(root.join(".bitmap"))?;
    let workspace = bit_object_import::parse_jsonc(&workspace_before)?;
    let bitmap_val = bit_object_import::parse_jsonc(&bitmap_before)?;
    let (ws_key, old_scope) = workspace_scope_info(&workspace)?;
    match &options.pattern {
        None => prepare_workspace_scope(
            root,
            &ws_key,
            &old_scope,
            &options.scope_name,
            workspace_before,
            bitmap_before,
            bitmap_val,
        ),
        Some(pattern) => prepare_component_scope(
            root,
            &old_scope,
            &options.scope_name,
            pattern,
            bitmap_before,
            bitmap_val,
            chalk,
        ),
    }
}

fn workspace_scope_info(workspace: &Value) -> Result<(String, String), Failure> {
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
    let scope = ws["defaultScope"]
        .as_str()
        .filter(|scope| !scope.is_empty())
        .ok_or_else(|| Failure::Declined("missing defaultScope".to_owned()))?;
    Ok((key, scope.to_owned()))
}

fn prepare_workspace_scope(
    root: &Path,
    ws_key: &str,
    old_scope: &str,
    new_scope: &str,
    workspace_before: Vec<u8>,
    bitmap_before: Vec<u8>,
    mut bitmap_val: Value,
) -> Result<Prepared, Failure> {
    if old_scope == new_scope {
        return Err(Failure::User(format!(
            r#"the default-scope is already set as "{new_scope}", nothing to change"#,
        )));
    }
    selection::validate_scope_name(new_scope)?;
    let bitmap_changed = update_bitmap_default_scope(&mut bitmap_val, old_scope, new_scope)?;
    Ok(Prepared::Workspace(WorkspacePlan {
        root: root.to_path_buf(),
        ws_key: ws_key.to_owned(),
        old_scope: old_scope.to_owned(),
        new_scope: new_scope.to_owned(),
        workspace_before,
        bitmap_before,
        bitmap_val,
        bitmap_changed,
    }))
}

fn update_bitmap_default_scope(
    bitmap_val: &mut Value,
    old_scope: &str,
    new_scope: &str,
) -> Result<bool, Failure> {
    let rows =
        bitmap_val.as_object_mut().ok_or_else(|| Failure::Declined("bitmap object".to_owned()))?;
    let mut changed = false;
    for (key, row) in rows {
        if key.starts_with('$')
            || matches!(key.as_str(), "_bit_lane" | "version")
            || !row.is_object()
            || has_version(key, row)
        {
            continue;
        }
        let default_scope = row["defaultScope"].as_str();
        let unscoped = row["scope"].as_str().is_none_or(str::is_empty);
        if default_scope == Some(old_scope) || (default_scope.is_none_or(str::is_empty) && unscoped)
        {
            row["defaultScope"] = json!(new_scope);
            changed = true;
        }
    }
    Ok(changed)
}

fn has_version(key: &str, row: &Value) -> bool {
    row["version"]
        .as_str()
        .is_some_and(|version| !version.trim().is_empty())
        || key
            .rsplit_once('@')
            .is_some_and(|(_, version)| !version.trim().is_empty())
}

fn prepare_component_scope(
    root: &Path,
    default_scope: &str,
    new_scope: &str,
    pattern: &str,
    bitmap_before: Vec<u8>,
    mut bitmap_val: Value,
    chalk: Chalk,
) -> Result<Prepared, Failure> {
    let bitmap = Bitmap::load(root, Some(default_scope))?;
    let matched = selection::resolve_pattern_entries(root, &bitmap, pattern, chalk)?;
    selection::validate_scope_name(new_scope)?;
    let new_entries = matched
        .iter()
        .copied()
        .filter(|entry| entry.id.version.as_deref().is_none_or(str::is_empty))
        .collect::<Vec<_>>();
    if new_entries.is_empty() {
        let ids = matched
            .iter()
            .map(|entry| selection::entry_full_id(entry))
            .collect::<Vec<_>>()
            .join(", ");
        return Err(Failure::User(format!(
            "unable to set default-scope for the following components, as they are not new:\n{ids}",
        )));
    }
    let mut changed_ids = Vec::with_capacity(new_entries.len());
    for entry in new_entries {
        set_entry_default_scope(&mut bitmap_val, entry, new_scope)?;
        changed_ids.push(format!("{new_scope}/{}", entry.id.name));
    }
    Ok(Prepared::Components(ComponentPlan {
        root: root.to_path_buf(),
        new_scope: new_scope.to_owned(),
        changed_ids,
        bitmap_before,
        bitmap_val,
    }))
}

fn set_entry_default_scope(
    bitmap_val: &mut Value,
    entry: &bit_install::workspace::BitmapEntry,
    new_scope: &str,
) -> Result<(), Failure> {
    let rows =
        bitmap_val.as_object_mut().ok_or_else(|| Failure::Declined("bitmap object".to_owned()))?;
    let (_, row) = rows
        .iter_mut()
        .find(|(key, row)| {
            !key.starts_with('$')
                && !matches!(key.as_str(), "_bit_lane" | "version")
                && row.is_object()
                && row["isAvailableOnCurrentLane"] != false
                && ((!entry.root_dir.is_empty()
                    && row["rootDir"].as_str() == Some(entry.root_dir.as_str()))
                    || super::update_cmd::bitmap_row_name(key, row) == entry.id.name)
        })
        .ok_or_else(|| Failure::Declined(format!("bitmap entry {}", entry.id.name)))?;
    row["defaultScope"] = json!(new_scope);
    Ok(())
}

impl Prepared {
    fn commit(self, chalk: Chalk) -> io::Result<Report> {
        match self {
            Self::Workspace(plan) => plan.commit(chalk),
            Self::Components(plan) => plan.commit(chalk),
        }
    }
}

impl WorkspacePlan {
    fn commit(self, chalk: Chalk) -> io::Result<Report> {
        let formatter = Formatter::new(chalk);
        let file_id = workspace_command::file_id();
        selection::publish_workspace_default_scope(
            &self.root,
            &self.workspace_before,
            &self.ws_key,
            &self.new_scope,
            &file_id,
        )?;
        if self.bitmap_changed {
            bit_object_import::component_deprecation::write_bitmap(
                &self.root,
                &self.bitmap_before,
                &self.bitmap_val,
                &file_id,
                "scope-set",
            )?;
        }
        let data = formatter.success_summary(&format!(
            r#"set the workspace's default-scope to {}. (previous scope was "{}")"#,
            chalk.bold(&self.new_scope),
            self.old_scope,
        ));
        Ok(Report { data, code: 0, details: None })
    }
}

impl ComponentPlan {
    fn commit(self, chalk: Chalk) -> io::Result<Report> {
        let formatter = Formatter::new(chalk);
        let file_id = workspace_command::file_id();
        bit_object_import::component_deprecation::write_bitmap(
            &self.root,
            &self.bitmap_before,
            &self.bitmap_val,
            &file_id,
            "scope-set",
        )?;
        let title = formatter.success_summary(&format!(
            "set {} as the default-scope for the following component(s)",
            chalk.bold(&self.new_scope),
        ));
        let items = self.changed_ids
            .iter()
            .map(|id| formatter.item(id))
            .collect::<Vec<_>>();
        Ok(Report { data: format!("{title}\n{}", items.join("\n")), code: 0, details: None })
    }
}
