//! Native `bit run-action <action-name> <remote> <options>` (`scopes/scope/actions/run-action.cmd.ts`).

#[cfg(test)]
mod tests;

use super::{
    Command, remote_action,
    workspace_command::{self, results::Report},
};
use crate::native::Outcome;
use serde_json::Value;
use std::{env, ffi::OsString, io};

pub const COMMAND: Command = Command { name: "run-action", aliases: &[], run };

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct Options {
    pub action_name: String,
    pub remote: String,
    pub payload: Value,
}

fn run(args: &[OsString]) -> io::Result<Outcome> {
    let Some(argv) = workspace_command::utf8_args(args) else {
        return Ok(Outcome::Declined("run-action arguments are not UTF-8".into()));
    };
    let Some(options) = parse_options(&argv[1..]) else {
        return Ok(Outcome::Declined("outside native run-action grammar".into()));
    };
    if !options.payload.is_object() {
        return Ok(Outcome::Declined("run-action options must be a JSON object".into()));
    }
    let file_supported = remote_action::supports_file(&options.action_name);
    let Ok(Some(plan)) =
        remote_action::prepare(&env::current_dir()?, &options.remote, false, file_supported)
    else {
        return Ok(Outcome::Declined("run-action requires a configured remote".into()));
    };
    plan.execute(args, "run-action", |_| {
        let runtime = tokio::runtime::Builder::new_current_thread().enable_all().build()?;
        let result = runtime.block_on(plan.action(&options.action_name, &options.payload))?;
        report(&result)
    })
}

pub(super) fn parse_options(args: &[&str]) -> Option<Options> {
    if args.len() != 3
        || args
            .iter()
            .any(|arg| arg.is_empty() || arg.starts_with('-'))
    {
        return None;
    }
    let payload = serde_json::from_str::<Value>(args[2]).ok()?;
    Some(Options { action_name: args[0].to_owned(), remote: args[1].to_owned(), payload })
}

fn report(value: &Value) -> io::Result<Report> {
    match value {
        Value::Null | Value::Bool(false) => {
            Ok(Report { data: String::new(), code: 0, details: None })
        }
        Value::Number(number) if number.as_f64() == Some(0.0) => {
            Ok(Report { data: String::new(), code: 0, details: None })
        }
        Value::String(text) => Ok(Report { data: text.clone(), code: 0, details: None }),
        Value::Bool(true) | Value::Number(_) | Value::Array(_) => {
            Ok(Report { data: "undefined".into(), code: 0, details: None })
        }
        Value::Object(map) => {
            if map
                .get("details")
                .is_some_and(|details| !details.is_null())
            {
                return Err(io::Error::other("unsupported run-action report details"));
            }
            let data = match map.get("data") {
                None => "undefined".to_owned(),
                Some(Value::Null) => "null".to_owned(),
                Some(Value::Bool(boolean)) => boolean.to_string(),
                Some(Value::Number(number)) => number.to_string(),
                Some(Value::String(text)) => text.clone(),
                Some(Value::Array(_) | Value::Object(_)) => {
                    return Err(io::Error::other("unsupported nested run-action report data"));
                }
            };
            let code = match map.get("code") {
                None | Some(Value::Null) => 0,
                Some(Value::Number(number)) => number
                    .as_i64()
                    .and_then(|code| i32::try_from(code).ok())
                    .unwrap_or(0),
                Some(_) => return Err(io::Error::other("unsupported run-action exit code")),
            };
            Ok(Report { data, code, details: None })
        }
    }
}
