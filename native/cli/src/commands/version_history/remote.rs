//! Dispatch a configured HTTP history rebuild and render its returned results.
use super::{Chalk, Outcome};
use crate::commands::{
    remote_action,
    workspace_command::{format::Formatter, results::Report},
};
use serde_json::{Value, json};
use std::{env, ffi::OsString, io};

pub(super) fn run(
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
    let Ok(Some(plan)) = remote_action::prepare(&env::current_dir()?, remote, true, false) else {
        return Ok(Outcome::Declined("history rebuild requires a configured HTTP remote".into()));
    };
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
    plan.execute(args, "build", |_| {
        let runtime = tokio::runtime::Builder::new_current_thread().enable_all().build()?;
        let result = runtime.block_on(plan.action("BuildVersionHistoryAction", &payload))?;
        Ok(Report { data: render(&result, Chalk::detect(args))?, code: 0, details: None })
    })
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
