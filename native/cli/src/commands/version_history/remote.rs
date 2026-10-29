//! Dispatch a configured HTTP history rebuild and render its returned results.
use super::{Chalk, Outcome, ScopeRoot, build};
use crate::commands::{
    remote_action,
    workspace_command::{format::Formatter, results::Report},
};
use serde_json::{Value, json};
use std::{env, ffi::OsString, io};

pub(super) fn run(
    root: &ScopeRoot,
    args: &[OsString],
    pattern: &str,
    from: Option<&str>,
    remote: &str,
) -> io::Result<Outcome> {
    if pattern.is_empty()
        || remote.is_empty()
        || remote.starts_with('-')
        || from.is_some_and(|value| value.is_empty() || value.starts_with('-'))
        || args
            .iter()
            .any(|arg| arg == "--no-color")
    {
        return Ok(Outcome::Declined("invalid remote history selection".into()));
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

fn payload(args: &[OsString], pattern: &str, from: Option<&str>) -> Value {
    let mut payload = json!({"pattern":pattern});
    if let Some(from) = from {
        payload["from-snap"] = json!(from);
        payload["fromSnap"] = json!(from);
    }
    if args
        .iter()
        .any(|arg| arg == "--from-all-lanes")
    {
        payload["from-all-lanes"] = json!(true);
        payload["fromAllLanes"] = json!(true);
    }
    if args
        .iter()
        .any(|arg| arg == "--delete-existing")
    {
        payload["delete-existing"] = json!(true);
        payload["deleteExisting"] = json!(true);
    }
    payload["component-pattern"] = json!(pattern);
    payload["componentPattern"] = json!(pattern);
    payload
}

fn file_scope_supported(scope: &std::path::Path) -> bool {
    let root = ScopeRoot { path: scope.to_owned(), bare: true };
    let index = std::fs::read(scope.join("index.json"))
        .ok()
        .and_then(|bytes| serde_json::from_slice::<Value>(&bytes).ok());
    index.is_some_and(|index| index["components"].is_array() && index["lanes"].is_array())
        && build::supported_startup(&root, scope) == Some(true)
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
    let mut lines = Vec::new();
    for (id, result) in results {
        let message = if !result["err"].is_null() {
            format!(
                "{} failed: {}",
                formatter.error_symbol(),
                result["err"]["message"].as_str().unwrap_or("undefined"),
            )
        } else if let Some(added) = result["added"].as_array() {
            format!("added {} hashes", added.len())
        } else {
            "no changes".to_owned()
        };
        lines.push(format!("{}: {message}", chalk.bold(id)));
    }
    Ok(format!("{summary}\n{}", lines.join("\n")))
}
