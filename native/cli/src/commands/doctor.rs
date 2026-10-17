//! Native built-in configuration, executable, filesystem and repository diagnostics.
mod archive;
mod catalog;
mod checks;
mod context;
mod options;
mod remote;
mod report;
mod store;
mod vendors;

use super::{
    Command,
    color::Chalk,
    workspace_command::{self, results::Report},
};
use crate::native::Outcome;
use context::Context;
use options::Options;
use serde_json::{Value, json};
use std::{env, ffi::OsString, io};
pub const COMMAND: Command = Command { name: "doctor", aliases: &[], run };
fn run(args: &[OsString]) -> io::Result<Outcome> {
    let Some(argv) = workspace_command::utf8_args(args) else {
        return Ok(Outcome::Declined("doctor arguments are not UTF-8".into()));
    };
    let Some(options) = Options::parse(&argv[1..]) else {
        return Ok(Outcome::Declined("outside the native doctor grammar".into()));
    };
    if colored_unknown(&options, Chalk::detect(args)) {
        return Ok(Outcome::Declined("published colored diagnosis error stack".into()));
    }
    let context = match prepare_context(&options) {
        Ok(context) => context,
        Err(error) => return Ok(Outcome::Declined(format!("doctor preflight: {error}"))),
    };
    let remote = match prepare_remote(context.as_ref(), &options) {
        Ok(remote) => remote,
        Err(error) => return Ok(Outcome::Declined(format!("doctor remote preflight: {error}"))),
    };
    let cwd = env::current_dir()?;
    let root = bit_workspace_config::workspace_root(&cwd).unwrap_or(cwd);
    let work = |output: &bit_install::output::Output| {
        produce(&options, context.as_ref(), remote.as_ref(), Chalk::detect(args), output)
    };
    if options.json {
        workspace_command::execute_json(&root, args, "doctor", work)
    } else {
        workspace_command::execute_then(&root, args, "doctor", work)
    }
}
fn prepare_context(options: &Options) -> io::Result<Option<Context>> {
    if options.list {
        return Ok(None);
    }
    let context = Context::load()?;
    store::preflight(&context, options.name.as_deref())?;
    Ok(Some(context))
}
fn prepare_remote(
    context: Option<&Context>,
    options: &Options,
) -> io::Result<Option<remote::Plan>> {
    if options.list {
        return Ok(None);
    }
    remote::prepare(context.ok_or_else(|| io::Error::other("missing doctor context"))?, options)
}
fn colored_unknown(options: &Options, chalk: Chalk) -> bool {
    !options.list
        && options.remote.is_none()
        && chalk.enabled()
        && options.name
            .as_deref()
            .is_some_and(|name| {
                !catalog::DIAGNOSES
                    .iter()
                    .any(|diagnosis| diagnosis.name == name)
            })
}
fn produce(
    options: &Options,
    context: Option<&Context>,
    remote: Option<&remote::Plan>,
    chalk: Chalk,
    output: &bit_install::output::Output,
) -> io::Result<Report> {
    options.validate().map_err(io::Error::other)?;
    if options.list {
        let data = if options.json {
            pretty(&Value::Array(
                catalog::DIAGNOSES
                    .iter()
                    .map(catalog::Diagnosis::listing)
                    .collect(),
            ))?
        } else {
            report::list(chalk)
        };
        return Ok(Report { data, code: 0, details: None });
    }
    let context = context.ok_or_else(|| io::Error::other("missing doctor context"))?;
    let (results, metadata) = if let Some(remote) = remote {
        remote::examine(context, options, remote)?
    } else {
        (examine(options, context, chalk, output)?, context.metadata()?)
    };
    let saved = archive::save(context, options, &results, &metadata)?;
    let data = if options.json {
        json_results(options, &results, saved.as_deref())?
    } else {
        report::results(&results, &metadata, saved.as_deref(), chalk)
    };
    Ok(Report { data, code: 0, details: None })
}
fn examine(
    options: &Options,
    context: &Context,
    chalk: Chalk,
    output: &bit_install::output::Output,
) -> io::Result<Vec<Value>> {
    if let Some(name) = &options.name {
        let diagnosis = catalog::DIAGNOSES
            .iter()
            .find(|diagnosis| diagnosis.name == name)
            .ok_or_else(|| io::Error::other(format!("error: diagnosis {name} not found")))?;
        return Ok(vec![checks::examine(diagnosis, context)?]);
    }
    let mut results = Vec::new();
    for (diagnosis, result) in catalog::DIAGNOSES
        .iter()
        .zip(examine_all(context))
    {
        match result {
            Ok(result) => results.push(result),
            Err(error) => output.failure(&chalk.red(&format!(
                "doctor failed running diagnosis \"{}\".\nerror-message: {error}",
                diagnosis.name,
            ))),
        }
    }
    Ok(results)
}
fn examine_all(context: &Context) -> Vec<io::Result<Value>> {
    std::thread::scope(|scope| {
        let mut workers = Vec::with_capacity(catalog::DIAGNOSES.len());
        for diagnosis in catalog::DIAGNOSES {
            workers.push(scope.spawn(move || checks::examine(diagnosis, context)));
        }
        workers
            .into_iter()
            .map(|worker| {
                worker
                    .join()
                    .unwrap_or_else(|_| Err(io::Error::other("doctor diagnosis worker panicked")))
            })
            .collect()
    })
}
fn json_results(options: &Options, results: &[Value], saved: Option<&str>) -> io::Result<String> {
    let mut value = json!({});
    if let Some(saved) = saved {
        value["savedFilePath"] = json!(saved);
    }
    if options.name.is_some() {
        value["examineResult"] = results[0].clone();
    } else {
        value["examineResults"] = json!(results);
    }
    pretty(&value)
}
fn pretty(value: &Value) -> io::Result<String> {
    serde_json::to_string_pretty(value).map_err(io::Error::other)
}
