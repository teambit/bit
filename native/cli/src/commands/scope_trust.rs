//! Native `bit scope trust [action] [pattern]` (`ScopeTrustCmd`).

#[cfg(test)]
mod tests;

use super::{
    color::Chalk,
    workspace_command::{self, format::Formatter, results::Report},
};
use crate::{native::Outcome, workspace};
use serde_json::{Value, json};
use std::{
    env,
    ffi::OsString,
    fs, io,
    path::{Path, PathBuf},
};

const BUILTIN_TRUSTED_PATTERNS: &[&str] =
    &["teambit.*", "bitdev.*", "learn-bit-react.*", "bitdesign.*", "frontend.*"];
const TRUSTED_SCOPES_KEY: &str = "trustedScopes";

#[derive(Debug, Clone, PartialEq, Eq)]
enum Action {
    List,
    Enable,
    Disable,
    Add(String),
    Remove(String),
}

#[derive(Debug)]
enum Failure {
    Declined(String),
    User(String),
}

impl From<io::Error> for Failure {
    fn from(error: io::Error) -> Self {
        Self::Declined(error.to_string())
    }
}

struct WorkspaceTrust {
    root: PathBuf,
    ws_key: String,
    default_scope: String,
    opted_in: bool,
    configured: Vec<String>,
}

pub(super) fn run(args: &[OsString]) -> io::Result<Outcome> {
    let Some(tokens) = parse_tokens(args) else {
        return Ok(Outcome::Declined(
            "arguments outside the native `scope trust` grammar".to_owned(),
        ));
    };
    let Some(root) = workspace::root(&env::current_dir()?) else {
        return Ok(Outcome::Declined("scope trust requires a workspace".to_owned()));
    };
    let chalk = Chalk::detect(args);
    match prepare_and_execute(&root, &tokens, chalk) {
        Ok(report) => workspace_command::execute_then(&root, args, "trust", |_output| Ok(report)),
        Err(Failure::User(message)) => {
            if env::var_os("CI").is_some_and(|value| !value.is_empty()) {
                return Ok(Outcome::Declined("CI scope trust error stack".to_owned()));
            }
            workspace_command::execute_then(&root, args, "trust", |_output| {
                Err(io::Error::other(message))
            })
        }
        Err(Failure::Declined(reason)) => Ok(Outcome::Declined(format!("scope trust: {reason}"))),
    }
}

fn parse_tokens(args: &[OsString]) -> Option<Vec<String>> {
    let tokens = args
        .iter()
        .skip(1)
        .map(|arg| arg.to_str())
        .collect::<Option<Vec<_>>>()?
        .into_iter()
        .filter(|token| {
            !matches!(
                *token,
                "--no-color"
                    | "--no-color=true"
                    | "--no-color=false"
                    | "--color"
                    | "--color=true"
                    | "--color=false"
                    | "--color=always"
                    | "--color=never",
            )
        })
        .collect::<Vec<_>>();
    let (&"trust", rest) = tokens.split_first()? else {
        return None;
    };
    let positional: Vec<String> = super::scope_set::collect_non_flag_tokens(rest)?
        .into_iter()
        .map(str::to_owned)
        .collect();
    (positional.len() <= 2).then_some(positional)
}

fn parse_action(tokens: &[String]) -> Result<Action, Failure> {
    let raw_action = tokens.first().map_or("list", String::as_str);
    let pattern = tokens.get(1).cloned();
    match raw_action {
        "list" => Ok(Action::List),
        "enable" => Ok(Action::Enable),
        "disable" => Ok(Action::Disable),
        "add" => Ok(Action::Add(require_pattern("add", pattern)?)),
        "remove" => Ok(Action::Remove(require_pattern("remove", pattern)?)),
        _ => Err(Failure::User(format!(
            r#"unknown action "{raw_action}". valid actions: list, enable, disable, add, remove."#,
        ))),
    }
}

fn require_pattern(action: &str, pattern: Option<String>) -> Result<String, Failure> {
    let Some(pattern) = pattern
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty())
    else {
        return Err(Failure::User(format!(
            r#""{action}" requires a pattern. example: bit scope trust {action} acme.frontend"#,
        )));
    };
    Ok(pattern)
}

fn prepare_and_execute(root: &Path, tokens: &[String], chalk: Chalk) -> Result<Report, Failure> {
    let trust = WorkspaceTrust::load(root)?;
    let action = parse_action(tokens)?;
    let formatter = Formatter::new(chalk);
    let data = match action {
        Action::List => trust.format_list(&formatter),
        Action::Enable => {
            trust.enable()?;
            formatter.success_summary(
                "scope-trust enabled (added trustedScopes: [] to workspace.jsonc)",
            )
        }
        Action::Disable => {
            trust.disable()?;
            formatter.success_summary(
                "scope-trust disabled (removed trustedScopes from workspace.jsonc)",
            )
        }
        Action::Add(pattern) => {
            trust.add(&pattern)?;
            formatter.success_summary(&format!(
                "added {} to trustedScopes in workspace.jsonc",
                chalk.bold(&pattern),
            ))
        }
        Action::Remove(pattern) => {
            trust.remove(&pattern)?;
            formatter.success_summary(&format!(
                "removed {} from trustedScopes in workspace.jsonc",
                chalk.bold(&pattern),
            ))
        }
    };
    Ok(Report { data, code: 0, details: None })
}

impl WorkspaceTrust {
    fn load(root: &Path) -> Result<Self, Failure> {
        let bytes = fs::read(root.join("workspace.jsonc"))?;
        let workspace = bit_object_import::parse_jsonc(&bytes)?;
        let rows = workspace
            .as_object()
            .ok_or_else(|| Failure::Declined("workspace.jsonc object".to_owned()))?;
        let ws_key = rows
            .keys()
            .find(|key| key.split('@').next() == Some("teambit.workspace/workspace"))
            .cloned()
            .unwrap_or_else(|| "teambit.workspace/workspace".to_owned());
        let ext = workspace[&ws_key].as_object();
        let default_scope = ext
            .and_then(|obj| obj.get("defaultScope"))
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_owned();
        let opted_in = ext.is_some_and(|obj| obj.contains_key(TRUSTED_SCOPES_KEY));
        let configured = ext
            .and_then(|obj| obj.get(TRUSTED_SCOPES_KEY))
            .and_then(Value::as_array)
            .map(|items| {
                items
                    .iter()
                    .filter_map(Value::as_str)
                    .map(str::to_owned)
                    .collect()
            })
            .unwrap_or_default();
        Ok(Self { root: root.to_path_buf(), ws_key, default_scope, opted_in, configured })
    }

    fn format_list(&self, formatter: &Formatter) -> String {
        if !self.opted_in {
            return Formatter::join(&[
                formatter.title("scope-trust is off for this workspace."),
                "aspects from any scope load without a check.".to_owned(),
                formatter.hint(
                    "to turn on:\n  bit scope trust enable        (no scopes added; only builtins + owner-of-defaultScope auto-trusted)\n  bit scope trust add <pattern> (turns on and adds the first scope)",
                ),
            ]);
        }
        let builtin = BUILTIN_TRUSTED_PATTERNS
            .iter()
            .map(|pattern| formatter.item(pattern))
            .collect::<Vec<_>>();
        let owner = self
            .inferred_owner_pattern()
            .into_iter()
            .map(|pattern| formatter.item(&pattern))
            .collect::<Vec<_>>();
        let configured_section = if self.configured.is_empty() {
            formatter.hint(
                "no scopes configured in workspace.jsonc. add one with `bit scope trust add <pattern>`.",
            )
        } else {
            let items = self.configured
                .iter()
                .map(|pattern| formatter.item(pattern))
                .collect::<Vec<_>>();
            formatter.section("configured in workspace.jsonc", "", &items)
        };
        Formatter::join(&[
            formatter.title("scope-trust is on. aspects from these scopes load without a prompt:"),
            formatter.section("builtin", "", &builtin),
            formatter.section("inferred from workspace defaultScope", "", &owner),
            configured_section,
        ])
    }

    fn inferred_owner_pattern(&self) -> Option<String> {
        if self.default_scope.is_empty() {
            return None;
        }
        let Some((owner, _)) = self.default_scope.split_once('.') else {
            return Some(self.default_scope.clone());
        };
        (!owner.is_empty()).then(|| format!("{owner}.*"))
    }

    fn enable(&self) -> Result<(), Failure> {
        if self.opted_in {
            return Ok(());
        }
        self.write_trusted_scopes(&[], "enable scope-trust")
    }

    fn disable(&self) -> Result<(), Failure> {
        if !self.opted_in {
            return Ok(());
        }
        let scope_path = workspace::scope_path(&self.root);
        let file_id = workspace_command::file_id();
        bit_install::command::edit_workspace_config(
            &self.root,
            &scope_path,
            &file_id,
            "disable scope-trust",
            |document| {
                document.remove(&[&self.ws_key, TRUSTED_SCOPES_KEY]);
            },
        )?;
        Ok(())
    }

    fn add(&self, pattern: &str) -> Result<(), Failure> {
        if !is_valid_pattern(pattern) {
            return Err(Failure::User(format!(
                r#"invalid scope pattern: "{pattern}". use an exact scope name (e.g. "acme.frontend" or "my-scope") or an owner wildcard (e.g. "acme.*")."#,
            )));
        }
        if self.configured
            .iter()
            .any(|item| item == pattern)
        {
            return Ok(());
        }
        let mut next = self.configured.clone();
        next.push(pattern.to_owned());
        self.write_trusted_scopes(&next, &format!("add trusted scope {pattern}"))
    }

    fn remove(&self, pattern: &str) -> Result<(), Failure> {
        if !self.configured
            .iter()
            .any(|item| item == pattern)
        {
            return Ok(());
        }
        let next = self.configured
            .iter()
            .filter(|item| item.as_str() != pattern)
            .cloned()
            .collect::<Vec<_>>();
        self.write_trusted_scopes(&next, &format!("remove trusted scope {pattern}"))
    }

    fn write_trusted_scopes(&self, list: &[String], reason: &str) -> Result<(), Failure> {
        let scope_path = workspace::scope_path(&self.root);
        let file_id = workspace_command::file_id();
        bit_install::command::edit_workspace_config(
            &self.root,
            &scope_path,
            &file_id,
            reason,
            |document| {
                document.set(&[&self.ws_key, TRUSTED_SCOPES_KEY], &json!(list));
            },
        )?;
        Ok(())
    }
}

fn is_valid_pattern(pattern: &str) -> bool {
    if let Some(owner) = pattern.strip_suffix(".*") {
        return !owner.contains('.') && valid_scope_str(owner);
    }
    valid_scope_str(pattern)
}

fn valid_scope_str(scope: &str) -> bool {
    scope.len() >= 2
        && !scope.starts_with('.')
        && !scope.ends_with('.')
        && scope
            .bytes()
            .filter(|byte| *byte == b'.')
            .count()
            <= 1
        && scope
            .bytes()
            .all(|byte| {
                byte.is_ascii_lowercase() || byte.is_ascii_digit() || b"$-_!.".contains(&byte)
            })
}
