//! Native `bit use <component-id>` (`UseCmd` in `scopes/workspace/workspace/use.cmd.ts`).

#[cfg(test)]
mod tests;

use super::{
    Command,
    color::Chalk,
    workspace_command::{self, format::Formatter, results::Report},
};
use crate::{native::Outcome, workspace};
use bit_install::workspace::Bitmap;
use bit_workspace_config::jsonc::Document;
use serde_json::{Value, json};
use std::{env, ffi::OsString, fs, io, path::Path};

pub const COMMAND: Command = Command { name: "use", aliases: &[], run };

enum Failure {
    Declined(String),
    User(String),
}

impl From<io::Error> for Failure {
    fn from(error: io::Error) -> Self {
        Self::Declined(error.to_string())
    }
}

fn run(args: &[OsString]) -> io::Result<Outcome> {
    let Some(target) = parse_target(args) else {
        return Ok(Outcome::Declined("arguments outside the native `use` grammar".to_owned()));
    };
    let Some(root) = workspace::root(&env::current_dir()?) else {
        return Ok(Outcome::Declined("use requires a workspace".to_owned()));
    };
    let chalk = Chalk::detect(args);
    match prepare(&root, &target, chalk) {
        Ok(report) => workspace_command::execute_then(&root, args, "use", |_output| Ok(report)),
        Err(Failure::User(message)) => {
            if env::var_os("CI").is_some_and(|value| !value.is_empty()) {
                return Ok(Outcome::Declined("CI use error stack".to_owned()));
            }
            workspace_command::execute_then(&root, args, "use", |_output| {
                Err(io::Error::other(message))
            })
        }
        Err(Failure::Declined(reason)) => Ok(Outcome::Declined(format!("use: {reason}"))),
    }
}

fn parse_target(args: &[OsString]) -> Option<String> {
    let mut target = None;
    for arg in args.iter().skip(1) {
        let str_arg = arg.to_str()?;
        if str_arg == "--no-color" {
            continue;
        }
        if str_arg.starts_with('-') {
            return None;
        }
        if target.is_none() {
            target = Some(str_arg.to_owned());
        } else {
            return None;
        }
    }
    target
}

fn prepare(root: &Path, target: &str, chalk: Chalk) -> Result<Report, Failure> {
    let ws_path = root.join("workspace.jsonc");
    let content = fs::read_to_string(&ws_path)?;
    let doc = Document::parse(&content)?;
    let doc_val = doc.value();
    let aspect_id = resolve_aspect_id(root, &doc_val, target)?;
    if is_extension_configured(&doc_val, &aspect_id) {
        return Err(Failure::User(format!(
            "error: the extension {aspect_id} is already configured in the config file",
        )));
    }
    let scope_path = workspace::scope_path(root);
    let file_id = workspace_command::file_id();
    let aspect_to_set = aspect_id.clone();
    bit_install::command::edit_workspace_config(
        root,
        &scope_path,
        &file_id,
        &format!("use ({target})"),
        move |document| {
            document.set(&[&aspect_to_set], &json!({}));
        },
    )?;
    let summary = Formatter::new(chalk).success_summary(&format!(
        r#"workspace.jsonc updated! features and extensions from "{aspect_id}" are now available."#,
    ));
    Ok(Report { data: summary, code: 0, details: None })
}

fn resolve_aspect_id(root: &Path, doc_val: &Value, target: &str) -> Result<String, Failure> {
    let default_scope = doc_val["teambit.workspace/workspace"]["defaultScope"]
        .as_str()
        .filter(|scope| !scope.is_empty());
    let bitmap = Bitmap::load(root, default_scope)?;
    let bare = target
        .split('@')
        .next()
        .unwrap_or(target);
    let normalized = bare.trim_start_matches("./").trim_end_matches('/');
    let entry = bitmap.entries
        .iter()
        .find(|entry| {
            entry.owns_its_dir()
                && (entry.id.to_string_without_version() == bare
                    || entry.id.name == bare
                    || (!entry.root_dir.is_empty() && entry.root_dir == normalized))
        });
    let Some(entry) = entry else {
        return Err(Failure::Declined("non-workspace aspect requires canonical import".to_owned()));
    };
    Ok(entry.id.to_string_without_version())
}

fn is_extension_configured(value: &Value, id: &str) -> bool {
    let Some(obj) = value.as_object() else {
        return false;
    };
    if obj.contains_key(id) {
        return true;
    }
    let prefix = format!("{id}@");
    obj.keys()
        .any(|key| key.starts_with(&prefix))
}
