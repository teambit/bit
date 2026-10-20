//! Native `bit scope set <scope-name> [component-pattern]` (`ScopeSetCmd`).

mod selection;
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
    fs,
    io::{self, Write},
    path::{Path, PathBuf},
};

#[derive(Debug, Clone, PartialEq, Eq)]
struct Options {
    scope_name: String,
    pattern: Option<String>,
}

enum Failure {
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
        .collect::<Option<Vec<_>>>()?;
    let (&"set", rest) = tokens.split_first()? else {
        return None;
    };
    if rest
        .iter()
        .any(|token| token.starts_with('-'))
    {
        return None;
    }
    let (scope_name, pattern) = match rest {
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
        if key.starts_with('$') || key == "_bit_lane" || has_version(key, row) {
            continue;
        }
        if row["defaultScope"].as_str() == Some(old_scope) {
            row["defaultScope"] = json!(new_scope);
            changed = true;
        }
    }
    Ok(changed)
}

fn has_version(key: &str, row: &Value) -> bool {
    row["version"]
        .as_str()
        .is_some_and(|version| !version.is_empty())
        || key
            .rsplit_once('@')
            .is_some_and(|(_, version)| !version.is_empty())
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
        set_entry_default_scope(&mut bitmap_val, &entry.id.name, new_scope)?;
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
    name: &str,
    new_scope: &str,
) -> Result<(), Failure> {
    let rows =
        bitmap_val.as_object_mut().ok_or_else(|| Failure::Declined("bitmap object".to_owned()))?;
    let (_, row) = rows
        .iter_mut()
        .find(|(key, row)| row["name"].as_str().unwrap_or(key.as_str()) == name)
        .ok_or_else(|| Failure::Declined(format!("bitmap entry {name}")))?;
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
        publish_workspace_default_scope(
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

fn publish_workspace_default_scope(
    root: &Path,
    before: &[u8],
    key: &str,
    scope: &str,
    file_id: &str,
) -> io::Result<()> {
    let text = std::str::from_utf8(before).map_err(io::Error::other)?;
    let mut document = bit_workspace_config::jsonc::Document::parse(text)?;
    document.set(&[key, "defaultScope"], &json!(scope));
    let _ = backup_workspace_config(root, before, scope, file_id);
    let rendered = format!("{document}\n");
    let bytes = if cfg!(windows)
        && before
            .windows(2)
            .any(|pair| pair == b"\r\n")
    {
        rendered.replace('\n', "\r\n").into_bytes()
    } else {
        rendered.into_bytes()
    };
    fs::write(root.join("workspace.jsonc"), bytes)
}

fn backup_workspace_config(
    root: &Path,
    before: &[u8],
    scope: &str,
    file_id: &str,
) -> io::Result<()> {
    let directory = workspace::scope_path(root).join("workspace-config-history");
    fs::create_dir_all(directory.join("files"))?;
    fs::write(directory.join("files").join(file_id), before)?;
    let mut metadata = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(directory.join("metadata.txt"))?;
    writeln!(metadata, "{file_id} default-scope ({scope})")
}
