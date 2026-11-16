//! Dispatch a configured HTTP history rebuild and render its returned results.
//!
//! [`run`] executes remote rebuild actions on [`ScopeRoot`] via [`remote_action`] and [`payload`] and formats a [`Report`] with [`Formatter`].
use super::{Chalk, Outcome, ScopeRoot, build};
use crate::commands::{
    remote_action,
    workspace_command::{format::Formatter, results::Report},
};
use serde_json::{Value, json};
use std::{env, ffi::OsString, io};

/// Executes a remote `BuildVersionHistory` HTTP action on `remote` for `pattern` in `root` ([`ScopeRoot`]) and formats the [`Outcome`].
pub(super) fn run(
    root: &ScopeRoot,
    args: &[OsString],
    pattern: &str,
    from: Option<&str>,
    remote: &str,
) -> io::Result<Outcome> {
    let pattern = pattern.trim();
    let remote = remote.trim();
    let from = from.map(str::trim);
    if pattern.is_empty()
        || remote.is_empty()
        || remote.starts_with('-')
        || from.is_some_and(|value| value.is_empty() || value.starts_with('-'))
    {
        return Ok(Outcome::Declined("invalid remote history selection".into()));
    }
    if root.bare && !file_scope_supported(&root.path) {
        return Ok(Outcome::Declined(
            "bare remote history caller requires unsupported startup".into(),
        ));
    }
    let Ok(Some(plan)) = remote_action::prepare(&env::current_dir()?, remote, true, true) else {
        return Ok(Outcome::Declined("history rebuild requires a configured HTTP remote".into()));
    };
    if let Some(scope) = plan.file_scope() {
        if !file_scope_supported(scope) {
            return Ok(Outcome::Declined("file remote scope requires unsupported startup".into()));
        }
        return build::run(root, args, pattern, from);
    }
    let payload = payload(args, pattern, from);
    plan.execute(args, "build", |_| {
        let runtime = tokio::runtime::Builder::new_current_thread().enable_all().build()?;
        let result = runtime.block_on(plan.action("BuildVersionHistoryAction", &payload))?;
        Ok(Report { data: render(&result, Chalk::detect(args))?, code: 0, details: None })
    })
}

/// Builds the JSON request payload ([`Value`]) for `BuildVersionHistoryAction` via [`build::has_bool_flag`].
#[inline]
fn payload(args: &[OsString], pattern: &str, from: Option<&str>) -> Value {
    let mut payload = json!({
        "pattern": pattern,
        "component-pattern": pattern,
        "componentPattern": pattern,
    });
    if let Some(from) = from {
        payload["from-snap"] = json!(from);
        payload["fromSnap"] = json!(from);
    }
    if build::has_bool_flag(
        args,
        "--from-all-lanes",
        "--from-all-lanes=true",
        "--from-all-lanes=false",
    ) {
        payload["from-all-lanes"] = json!(true);
        payload["fromAllLanes"] = json!(true);
    }
    if build::has_bool_flag(
        args,
        "--delete-existing",
        "--delete-existing=true",
        "--delete-existing=false",
    ) {
        payload["delete-existing"] = json!(true);
        payload["deleteExisting"] = json!(true);
    }
    payload
}

/// Returns `true` when bare file `scope` has a [`clean_index`], [`clean_unmerged`], and supported startup ([`ScopeRoot`]).
#[inline]
fn file_scope_supported(scope: &std::path::Path) -> bool {
    let root = ScopeRoot { path: scope.to_owned(), bare: true };
    clean_index(scope)
        && clean_unmerged(scope)
        && build::supported_startup(&root, scope) == Some(true)
}

/// Returns `true` when `index.json` in `scope` is absent or contains no staged/unexported entries.
#[inline]
fn clean_index(scope: &std::path::Path) -> bool {
    let bytes = match std::fs::read(scope.join("index.json")) {
        Ok(bytes) => bytes,
        Err(error) => return error.kind() == io::ErrorKind::NotFound,
    };
    let Ok(index) = bit_object_import::parse_jsonc(&bytes) else { return false };
    index
        .as_array()
        .is_some_and(|items| items.iter().all(Value::is_object))
        || ["components", "lanes"]
            .iter()
            .all(|key| {
                index[key]
                    .as_array()
                    .is_some_and(|items| items.iter().all(Value::is_object))
            })
}

#[inline]
fn clean_unmerged(scope: &std::path::Path) -> bool {
    match std::fs::read(scope.join("unmerged.json")) {
        Ok(bytes) => bit_object_import::parse_jsonc(&bytes)
            .is_ok_and(|value| value.as_array().is_some_and(Vec::is_empty)),
        Err(error) => error.kind() == io::ErrorKind::NotFound,
    }
}

fn render(value: &Value, chalk: Chalk) -> io::Result<String> {
    let results =
        value.as_object().ok_or_else(|| io::Error::other("invalid remote history result"))?;
    let formatter = Formatter::new(chalk);
    let errors = results
        .values()
        .any(|result| !result["err"].is_null());
    let summary = if errors {
        format!(
            "{} {}",
            formatter.warn_symbol(),
            chalk.yellow("completed building version history (with errors)"),
        )
    } else {
        formatter.success_summary("completed building version history")
    };
    let mut lines = Vec::with_capacity(results.len());
    for (id, result) in results {
        let message = if !result["err"].is_null() {
            let err_msg = [result["err"]["message"].as_str(), result["err"].as_str()]
                .into_iter()
                .flatten()
                .map(str::trim)
                .find(|msg| !msg.is_empty())
                .unwrap_or("undefined");
            format!("{} failed: {err_msg}", formatter.error_symbol())
        } else if let Some(added) = result["added"].as_array() {
            format!("added {} hashes", added.len())
        } else {
            "no changes".to_owned()
        };
        lines.push(format!("{}: {message}", chalk.bold(id.trim())));
    }
    Ok(format!("{summary}\n{}", lines.join("\n")))
}
