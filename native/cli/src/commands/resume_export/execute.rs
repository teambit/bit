//! Validate every configured remote before serial, retryable export persistence.
use super::Options;
use crate::{
    commands::{
        color::Chalk,
        remote_action::{self, Plan},
        workspace_command::results::Report,
    },
    native::Outcome,
};
use bit_install::output::Output;
use serde_json::{Value, json};
use std::{env, ffi::OsString, io, sync::Arc};
use tokio::task::JoinSet;

pub(super) fn run(args: &[OsString], options: &Options) -> io::Result<Outcome> {
    let cwd = env::current_dir()?;
    let mut plans = Vec::new();
    let mut names = Vec::new();
    for name in &options.remotes {
        if options.delete && names.contains(name) {
            continue;
        }
        names.push(name.clone());
        match remote_action::prepare(&cwd, name, true, options.delete) {
            Ok(Some(plan)) => plans.push(Arc::new(plan)),
            Ok(None) => {
                return Ok(Outcome::Declined(
                    "export recovery requires an unported scope or resolver".into(),
                ));
            }
            Err(error) => {
                return Ok(Outcome::Declined(format!("export recovery preflight: {error}")));
            }
        }
    }
    let Some(first) = plans.first() else {
        return Ok(Outcome::Declined("export recovery requires remotes".into()));
    };
    first.execute(args, "resume-export", |output| report(args, options, &plans, &names, output))
}

fn report(
    args: &[OsString],
    options: &Options,
    plans: &[Arc<Plan>],
    names: &[String],
    output: &Output,
) -> io::Result<Report> {
    let runtime = tokio::runtime::Builder::new_current_thread().enable_all().build()?;
    if options.delete {
        let data = runtime.block_on(super::deletion::run(plans, names, options, args, output))?;
        return Ok(Report { data, code: 0, details: None });
    }
    let ids = runtime.block_on(persist(plans, options, output))?;
    let data = if ids.is_empty() {
        Chalk::detect(args).yellow("no components were left to persist for this export-id")
    } else {
        format!("the following components were persisted successfully:\n{}", ids.join("\n"))
    };
    Ok(Report { data, code: 0, details: None })
}

async fn persist(
    plans: &[Arc<Plan>],
    options: &Options,
    output: &Output,
) -> io::Result<Vec<String>> {
    output.restart("verifying that objects can be merged on the remotes...");
    validate(plans, &options.export_id).await?;
    let mut ids = Vec::new();
    for (plan, name) in plans.iter().zip(&options.remotes) {
        output.restart(&format!(r#"persisting data on the remote "{name}"..."#));
        let value = persist_one(plan, name, &options.export_id).await?;
        append_ids(&mut ids, value)?;
    }
    Ok(ids)
}

async fn validate(plans: &[Arc<Plan>], client_id: &str) -> io::Result<()> {
    let mut tasks = JoinSet::new();
    for plan in plans {
        let plan = Arc::clone(plan);
        let payload = json!({"clientId":client_id,"isResumingExport":true});
        tasks.spawn(async move { plan.action("ExportValidate", &payload).await });
    }
    while let Some(result) = tasks.join_next().await {
        result.map_err(io::Error::other)??;
    }
    Ok(())
}

async fn persist_one(plan: &Plan, name: &str, client_id: &str) -> io::Result<Value> {
    let mut error = String::new();
    for _ in 0..3 {
        match plan.action("ExportPersist", &json!({"clientId":client_id})).await {
            Ok(value) => return Ok(value),
            Err(last) => error = last.to_string(),
        }
    }
    Err(io::Error::other(format!(
        "failed persisting to the following scopes: {name}\n\
        errors:\n\
        {name} - {error}\n\n\
        the remote bit.dev will try to re-persist the data for the failed scopes.\n   ",
    )))
}

fn append_ids(ids: &mut Vec<String>, value: Value) -> io::Result<()> {
    match value {
        Value::Null => {}
        Value::Array(values) => {
            for value in values {
                if let Some(value) = value
                    .as_str()
                    .filter(|value| !value.is_empty())
                {
                    ids.push(value.to_owned());
                }
            }
        }
        Value::String(value) if !value.is_empty() => ids.push(value),
        _ => return Err(io::Error::other("invalid remote export result")),
    }
    Ok(())
}
