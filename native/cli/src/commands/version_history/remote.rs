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
    clean_index(scope)
        && clean_unmerged(scope)
        && build::supported_startup(&root, scope) == Some(true)
}

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
    let mut lines = Vec::new();
    for (id, result) in results {
        let message = if !result["err"].is_null() {
            format!(
                "{} failed: {}",
                formatter.error_symbol(),
                result["err"]["message"]
                    .as_str()
                    .map(str::trim)
                    .filter(|msg| !msg.is_empty())
                    .unwrap_or("undefined"),
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
