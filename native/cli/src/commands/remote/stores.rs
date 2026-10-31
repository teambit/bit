//! Scope discovery (`findScopePath`), `GlobalRemotes`, and `ScopeJson` persistence for `bit remote`.

use super::options::{Action, Options};
use crate::commands::{
    color::Chalk, list::table, workspace_command, workspace_command::format::Formatter,
};
use serde_json::{Map, Value, json};
use std::{
    env,
    ffi::OsString,
    fs, io,
    path::{Component, Path, PathBuf},
};

const GLOBAL_REMOTES_FILE: &str = "global-remotes.json";
const SCOPE_KEYS: [&str; 8] =
    ["name", "remotes", "resolverPath", "license", "groupName", "version", "lanes", "config"];

pub(super) enum Failure {
    Declined(String),
    User(String),
}

impl From<io::Error> for Failure {
    fn from(error: io::Error) -> Self {
        Self::Declined(error.to_string())
    }
}

pub(super) struct Prepared {
    pub(super) report: String,
    writes: Vec<(PathBuf, Vec<u8>)>,
}

impl Prepared {
    pub(super) fn commit(&self) -> io::Result<()> {
        for (path, bytes) in &self.writes {
            if let Some(parent) = path.parent() {
                fs::create_dir_all(parent)?;
            }
            fs::write(path, bytes)?;
        }
        Ok(())
    }
}

pub(super) fn prepare(options: &Options, args: &[OsString]) -> Result<Prepared, Failure> {
    let cwd = env::current_dir()?;
    let chalk = Chalk::detect(args);
    match &options.action {
        Action::List => prepare_list(options.global, &cwd, args, chalk),
        Action::Add(url) => prepare_add(url, options.global, &cwd, chalk),
        Action::Del(name) => prepare_del(name, options.global, &cwd, chalk),
    }
}

fn prepare_list(
    global: bool,
    cwd: &Path,
    args: &[OsString],
    chalk: Chalk,
) -> Result<Prepared, Failure> {
    let mut writes = Vec::new();
    let remotes = if global {
        load_global_remotes(&mut writes)?
    } else {
        let (_, scope_source) = load_local_scope_json(cwd, chalk)?;
        let scope_remotes = extract_remotes(scope_source.get("remotes"))?;
        let mut combined = load_global_remotes(&mut writes)?;
        for (name, host) in scope_remotes {
            combined.insert(name, host);
        }
        combined
    };
    let ordered = bit_workspace_config::jsonc::Node::from_value(&Value::Object(remotes)).to_value();
    let remotes = ordered.as_object().ok_or_else(|| Failure::Declined("remote map".to_owned()))?;
    let report = if remotes.is_empty() {
        Formatter::new(chalk).hint("no configured remotes found in scope")
    } else {
        let rows = remotes
            .iter()
            .filter_map(|(name, host)| Some(vec![name.clone(), host.as_str()?.to_owned()]))
            .collect::<Vec<_>>();
        table::render(&["scope name", "host"], &rows, table::colors(args))
    };
    Ok(Prepared { report, writes })
}

fn prepare_add(url: &str, global: bool, cwd: &Path, chalk: Chalk) -> Result<Prepared, Failure> {
    let raw_target = url
        .strip_prefix("file://")
        .ok_or_else(|| Failure::Declined("non-file remote URL".to_owned()))?;
    let target_dir = resolve_path(cwd, raw_target);
    let (_, target_scope) = load_remote_scope_json(&target_dir, chalk)?;
    let remote_name = target_scope
        .get("name")
        .and_then(Value::as_str)
        .filter(|name| !name.is_empty() && *name != "__proto__")
        .ok_or_else(|| Failure::Declined("remote scope name".to_owned()))?
        .to_owned();
    let mut writes = Vec::new();
    if global {
        let mut remotes = load_global_remotes(&mut writes)?;
        remotes.insert(remote_name.clone(), Value::String(url.to_owned()));
        writes.push((global_remotes_path(), render_json(&Value::Object(remotes))?));
    } else {
        let (scope_dir, mut scope_source) = load_local_scope_json(cwd, chalk)?;
        let mut remotes = extract_remotes(scope_source.get("remotes"))?;
        remotes.insert(remote_name.clone(), Value::String(url.to_owned()));
        scope_source.insert("remotes".to_owned(), Value::Object(remotes));
        writes.push((scope_dir.join("scope.json"), render_scope_json(&scope_source)?));
    }
    let report = Formatter::new(chalk)
        .success_summary(&format!(
            "added remote scope '{}' with host '{}'",
            chalk.bold(&remote_name),
            chalk.bold(url),
        ));
    Ok(Prepared { report, writes })
}

fn prepare_del(name: &str, global: bool, cwd: &Path, chalk: Chalk) -> Result<Prepared, Failure> {
    let mut writes = Vec::new();
    if global {
        let mut remotes = load_global_remotes(&mut writes)?;
        if remotes.shift_remove(name).is_none() {
            return Err(Failure::User(format!(
                r#"remote "{name}" was not found globally, to remove a local remote, please omit the "--global" flag"#,
            )));
        }
        writes.push((global_remotes_path(), render_json(&Value::Object(remotes))?));
    } else {
        let (scope_dir, mut scope_source) = load_local_scope_json(cwd, chalk)?;
        let mut remotes = extract_remotes(scope_source.get("remotes"))?;
        if remotes.shift_remove(name).is_none() {
            return Err(Failure::User(format!(
                r#"remote "{name}" was not found locally, to remove a global remote, please use "--global" flag"#,
            )));
        }
        scope_source.insert("remotes".to_owned(), Value::Object(remotes));
        writes.push((scope_dir.join("scope.json"), render_scope_json(&scope_source)?));
    }
    let report =
        Formatter::new(chalk).success_summary(&format!("removed remote {}", chalk.bold(name)));
    Ok(Prepared { report, writes })
}

fn global_remotes_path() -> PathBuf {
    bit_workspace_config::global_config_dir().join(GLOBAL_REMOTES_FILE)
}

fn load_global_remotes(
    writes: &mut Vec<(PathBuf, Vec<u8>)>,
) -> Result<Map<String, Value>, Failure> {
    let path = global_remotes_path();
    if !path.exists() {
        writes.push((path, b"{}".to_vec()));
        return Ok(Map::new());
    }
    let bytes = fs::read(&path)?;
    if bytes.is_empty() {
        return Ok(Map::new());
    }
    let value: Value = bit_workspace_config::parse_jsonc(&bytes)
        .map_err(|error| Failure::Declined(error.to_string()))?;
    extract_remotes(Some(&value))
}

fn load_local_scope_json(
    from_path: &Path,
    chalk: Chalk,
) -> Result<(PathBuf, Map<String, Value>), Failure> {
    load_scope_json(from_path, chalk, true)
}

fn load_remote_scope_json(
    from_path: &Path,
    chalk: Chalk,
) -> Result<(PathBuf, Map<String, Value>), Failure> {
    load_scope_json(from_path, chalk, false)
}

fn load_scope_json(
    from_path: &Path,
    chalk: Chalk,
    allow_workspace_init: bool,
) -> Result<(PathBuf, Map<String, Value>), Failure> {
    let Some(scope_dir) = find_scope_path(from_path) else {
        if allow_workspace_init && crate::workspace::root(from_path).is_some() {
            return Err(Failure::Declined("workspace scope not initialized yet".to_owned()));
        }
        return Err(Failure::User(format!(
            "error: scope not found at {}",
            chalk.bold(&from_path.to_string_lossy()),
        )));
    };
    let scope_json_path = scope_dir.join("scope.json");
    if !scope_json_path.exists() {
        return Err(Failure::Declined("scope.json missing".to_owned()));
    }
    let value: Value = bit_workspace_config::parse_jsonc(&fs::read(&scope_json_path)?)
        .map_err(|error| Failure::Declined(error.to_string()))?;
    let object = value
        .as_object()
        .cloned()
        .ok_or_else(|| Failure::Declined("scope.json is not an object".to_owned()))?;
    if object
        .keys()
        .any(|key| !SCOPE_KEYS.contains(&key.as_str()))
    {
        return Err(Failure::Declined("scope.json has unknown keys".to_owned()));
    }
    Ok((scope_dir, object))
}

fn extract_remotes(remotes: Option<&Value>) -> Result<Map<String, Value>, Failure> {
    let Some(remotes) = remotes.filter(|value| !value.is_null()) else {
        return Ok(Map::new());
    };
    let object = remotes
        .as_object()
        .ok_or_else(|| Failure::Declined("remotes is not an object".to_owned()))?;
    if object.contains_key("__proto__") || !object.values().all(Value::is_string) {
        return Err(Failure::Declined("unsupported remote entry".to_owned()));
    }
    Ok(object.clone())
}

fn render_scope_json(source: &Map<String, Value>) -> Result<Vec<u8>, Failure> {
    let mut plain = Map::new();
    for key in SCOPE_KEYS {
        match key {
            "remotes" => {
                let remotes = source
                    .get("remotes")
                    .and_then(Value::as_object)
                    .cloned()
                    .unwrap_or_default();
                plain.insert(key.to_owned(), Value::Object(remotes));
            }
            "lanes" => {
                let lanes = source
                    .get("lanes")
                    .filter(|value| bit_workspace_config::truthy(value))
                    .cloned()
                    .unwrap_or_else(|| json!({ "current": "main", "tracking": [], "new": [] }));
                plain.insert(key.to_owned(), lanes);
            }
            _ => {
                if let Some(value) =
                    source.get(key).filter(|value| bit_workspace_config::truthy(value))
                {
                    plain.insert(key.to_owned(), value.clone());
                }
            }
        }
    }
    render_json(&Value::Object(plain))
}

fn render_json(value: &Value) -> Result<Vec<u8>, Failure> {
    let ordered = bit_workspace_config::jsonc::Node::from_value(value).to_value();
    bit_workspace_config::render_scope_json(&ordered).map_err(Failure::from)
}

/// `resolveHomePath` followed by `path.resolve(cwd, path)`.
pub(super) fn resolve_path(cwd: &Path, raw: &str) -> PathBuf {
    let expanded = if raw == "~" {
        workspace_command::home()
    } else if let Some(rest) = raw
        .strip_prefix("~/")
        .or_else(|| raw.strip_prefix(r"~\"))
    {
        workspace_command::home().join(rest)
    } else {
        PathBuf::from(raw)
    };
    let joined = if expanded.is_absolute() { expanded } else { cwd.join(expanded) };
    normalize_path(&joined)
}

fn normalize_path(path: &Path) -> PathBuf {
    let mut normalized = PathBuf::new();
    for component in path.components() {
        match component {
            Component::CurDir => {}
            Component::ParentDir => {
                let _ = normalized.pop();
            }
            other => normalized.push(other.as_os_str()),
        }
    }
    normalized
}

/// `findScopePath(fromPath)` (`components/modules/find-scope-path/find-scope-path.ts`).
pub(super) fn find_scope_path(from_path: &Path) -> Option<PathBuf> {
    if !from_path.exists() {
        return None;
    }
    for current in from_path.ancestors() {
        if let Some(found) = scope_at_dir(current) {
            return found;
        }
        if is_git_file(current) {
            return None;
        }
    }
    None
}

fn scope_at_dir(current: &Path) -> Option<Option<PathBuf>> {
    if is_scope_dir(current) {
        if current
            .file_name()
            .is_some_and(|name| name == ".git")
        {
            return Some(None);
        }
        let dot_bit = current.join(".bit");
        return Some(Some(if is_scope_dir(&dot_bit) { dot_bit } else { current.to_path_buf() }));
    }
    let dot_bit = current.join(".bit");
    if is_scope_dir(&dot_bit) {
        return Some(Some(dot_bit));
    }
    let git_bit = current.join(".git/bit");
    is_scope_dir(&git_bit).then_some(Some(git_bit))
}

fn is_scope_dir(dir: &Path) -> bool {
    fs::symlink_metadata(dir.join("objects")).is_ok_and(|metadata| metadata.is_dir())
}

fn is_git_file(dir: &Path) -> bool {
    fs::symlink_metadata(dir.join(".git")).is_ok_and(|metadata| metadata.is_file())
}
