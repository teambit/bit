//! Probe pending exports before deleting, retaining per-scope failures and old-server answers.
use super::{Options, deletion_report};
use crate::commands::{
    color::Chalk, install, remote_action::Plan, workspace_command::format::Formatter,
};
use bit_install::output::Output;
use indexmap::IndexMap;
use serde_json::json;
use std::{
    env,
    ffi::OsString,
    io::{self, IsTerminal},
    sync::Arc,
};
use tokio::task::JoinSet;

#[derive(Default)]
pub(super) struct Answers {
    pub present: Vec<String>,
    pub absent: Vec<String>,
    pub unknown: Vec<String>,
    pub failed: IndexMap<String, String>,
}

pub(super) async fn run(
    plans: &[Arc<Plan>],
    names: &[String],
    options: &Options,
    args: &[OsString],
    output: &Output,
) -> io::Result<String> {
    let formatter = Formatter::new(Chalk::detect(args));
    let probe = ask(plans, names, &options.export_id, false).await?;
    if probe.failed.len() == names.len() {
        return Err(io::Error::other(format!(
            "failed reaching all the given scopes:\n{}",
            deletion_report::failed_lines(&probe.failed).join("\n"),
        )));
    }
    let to_clear: Vec<String> = probe.present
        .iter()
        .chain(&probe.unknown)
        .cloned()
        .collect();
    if to_clear.is_empty() {
        return Ok(deletion_report::nothing(&formatter, &options.export_id, &probe));
    }
    output.console(&deletion_report::probe(&formatter, &options.export_id, &probe, &to_clear));
    if !options.force {
        confirm(&formatter, &options.export_id, to_clear.len())?;
    }
    let clear_plans: Vec<_> = to_clear
        .iter()
        .map(|name| {
            Arc::clone(
                &plans[names
                    .iter()
                    .position(|candidate| candidate == name)
                    .expect("probe answers belong to the configured remotes")],
            )
        })
        .collect();
    let result = ask(&clear_plans, &to_clear, &options.export_id, true).await?;
    deletion_report::result(&formatter, &options.export_id, &probe, result)
}

fn confirm(formatter: &Formatter, export_id: &str, count: usize) -> io::Result<()> {
    if !io::stdout().is_terminal()
        || !io::stdin().is_terminal()
        || ["CI", "CLAUDECODE", "CLAUDE_CODE", "CURSOR_AGENT"]
            .iter()
            .any(|key| env::var_os(key).is_some())
    {
        return Err(io::Error::other(
            "unable to prompt for confirmation in a non-interactive terminal.\nreview the list above and re-run with \"--force\" to delete",
        ));
    }
    let question = format!(
        "deleting the pending objects of \"{export_id}\" from {count} scope(s) cannot be undone.\n{}",
        formatter.chalk.bold("Would you like to proceed? [yes(y)/no(n)]"),
    );
    if !install::confirm(&question)? {
        return Err(io::Error::other("aborted, nothing was deleted"));
    }
    Ok(())
}

async fn ask(
    plans: &[Arc<Plan>],
    names: &[String],
    export_id: &str,
    delete: bool,
) -> io::Result<Answers> {
    let mut answers = Answers::default();
    let limit = plans.first().map_or(15, |plan| plan.concurrency);
    let mut pending = plans.iter().zip(names);
    let mut tasks = JoinSet::new();
    loop {
        while tasks.len() < limit {
            let Some((plan, name)) = pending.next() else { break };
            let plan = Arc::clone(plan);
            let name = name.clone();
            let payload = json!({"clientId":export_id});
            tasks.spawn(async move {
                let action = if delete { "RemovePendingDir" } else { "PendingDirStatus" };
                (name, plan.action(action, &payload).await)
            });
        }
        let Some(result) = tasks.join_next().await else { break };
        let (name, result) = result.map_err(io::Error::other)?;
        answers.record(name, result, delete);
    }
    Ok(answers)
}

impl Answers {
    fn record(&mut self, name: String, result: io::Result<serde_json::Value>, delete: bool) {
        match result {
            Ok(value) => match value[if delete { "existed" } else { "exists" }].as_bool() {
                Some(true) => self.present.push(name),
                Some(false) => self.absent.push(name),
                None => self.unknown.push(name),
            },
            Err(error) if !delete && bit_client_transfer::http::is_action_not_found(&error) => {
                self.unknown.push(name);
            }
            Err(error) => {
                self.failed.insert(name, error.to_string());
            }
        }
    }
}
