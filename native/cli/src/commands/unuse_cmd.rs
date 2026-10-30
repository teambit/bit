//! Native `bit unuse <component-id>` (`UnuseCmd` in `scopes/workspace/workspace/unuse.cmd.ts`).

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
use serde_json::Value;
use std::{env, ffi::OsString, fs, io, path::Path};

pub const COMMAND: Command = Command { name: "unuse", aliases: &[], run };

enum Failure {
    Declined(String),
}

impl From<io::Error> for Failure {
    fn from(error: io::Error) -> Self {
        Self::Declined(error.to_string())
    }
}

fn run(args: &[OsString]) -> io::Result<Outcome> {
    let Some(target) = parse_target(args) else {
        return Ok(Outcome::Declined("arguments outside the native `unuse` grammar".to_owned()));
    };
    let Some(root) = workspace::root(&env::current_dir()?) else {
        return Ok(Outcome::Declined("unuse requires a workspace".to_owned()));
    };
    let chalk = Chalk::detect(args);
    match prepare(&root, &target, chalk) {
        Ok(report) => workspace_command::execute_then(&root, args, "unuse", |_output| Ok(report)),
        Err(Failure::Declined(reason)) => Ok(Outcome::Declined(format!("unuse: {reason}"))),
    }
}

fn parse_target(args: &[OsString]) -> Option<String> {
    let tokens = args
        .iter()
        .skip(1)
        .map(|arg| arg.to_str())
        .collect::<Option<Vec<_>>>()?;
    let filtered = super::scope_set::collect_non_flag_tokens(&tokens)?;
    let [target] = filtered.as_slice() else {
        return None;
    };
    Some((*target).to_owned())
}

fn prepare(root: &Path, target: &str, chalk: Chalk) -> Result<Report, Failure> {
    let content = fs::read_to_string(root.join("workspace.jsonc"))?;
    let doc = Document::parse(&content)?;
    let formatter = Formatter::new(chalk);
    let Some((key_to_remove, resolved_id)) =
        resolve_configured_aspect_key(root, &doc.value(), target)
    else {
        let hint =
            formatter.hint(&format!(r#""{target}" was not found in the workspace.jsonc file."#));
        return Ok(Report { data: hint, code: 0, details: None });
    };
    apply_unuse(root, target, &key_to_remove, &resolved_id)?;
    let summary = formatter.success_summary(&format!(
        r#"workspace.jsonc updated! the aspect "{target}" has been removed."#,
    ));
    Ok(Report { data: summary, code: 0, details: None })
}

fn apply_unuse(
    root: &Path,
    target: &str,
    key_to_remove: &str,
    resolved_id: &str,
) -> io::Result<()> {
    let clean_target = target.to_owned();
    let id = resolved_id.to_owned();
    let key = key_to_remove.to_owned();
    bit_install::command::edit_workspace_config(
        root,
        &workspace::scope_path(root),
        &workspace_command::file_id(),
        "remove components",
        move |document| {
            document.remove(&[&key]);
            clean_generator_envs(document, &clean_target, &id);
        },
    )
}

fn clean_generator_envs(document: &mut Document, target: &str, resolved_id: &str) {
    if let Some(Value::Array(envs)) = document.get(&["teambit.generator/generator", "envs"]) {
        let filtered: Vec<Value> = envs
            .into_iter()
            .filter(|env| env.as_str() != Some(target) && env.as_str() != Some(resolved_id))
            .collect();
        document.set(&["teambit.generator/generator", "envs"], &Value::Array(filtered));
    }
}

fn resolve_configured_aspect_key(
    root: &Path,
    doc_val: &Value,
    target: &str,
) -> Option<(String, String)> {
    let bare = target
        .split('@')
        .next()
        .unwrap_or(target);
    if let Some(key) =
        find_extension_key(doc_val, target).or_else(|| find_extension_key(doc_val, bare))
    {
        return Some((key, bare.to_owned()));
    }
    let default_scope = doc_val["teambit.workspace/workspace"]["defaultScope"]
        .as_str()
        .filter(|scope| !scope.is_empty());
    if let Ok(bitmap) = Bitmap::load(root, default_scope) {
        let normalized = bare.trim_start_matches("./").trim_end_matches('/');
        let entry = bitmap.entries
            .iter()
            .find(|entry| {
                entry.owns_its_dir()
                    && (entry.id.to_string_without_version() == bare
                        || entry.id.name == bare
                        || (!entry.root_dir.is_empty() && entry.root_dir == normalized))
            });
        if let Some(entry) = entry {
            let id = entry.id.to_string_without_version();
            if let Some(key) = find_extension_key(doc_val, &id) {
                return Some((key, id));
            }
        }
    }
    None
}

fn find_extension_key(value: &Value, id: &str) -> Option<String> {
    let obj = value.as_object()?;
    if obj.contains_key(id) {
        return Some(id.to_owned());
    }
    let prefix = format!("{id}@");
    obj.keys()
        .find(|key| key.starts_with(&prefix))
        .cloned()
}
