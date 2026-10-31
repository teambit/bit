//! Native `bit ripple <sub-command>` (`scopes/cloud/ripple/ripple.cmd.ts`).

#[cfg(test)]
mod tests;

use super::{
    Command,
    color::Chalk,
    workspace_command::{self, results::Report},
};
use crate::{native::Outcome, workspace};
use bit_object_import::parse_jsonc;
use serde_json::{Value, json};
use std::{
    env,
    ffi::OsString,
    fs,
    io::{self, Write},
    path::Path,
    process::ExitCode,
};

pub const COMMAND: Command = Command { name: "ripple", aliases: &[], run };

const BARE_RIPPLE_MSG: &str =
    "[ripple] please specify a subcommand. See --help for available commands.";
const NO_JOB_MSG: &str = "Could not find a Ripple CI job. Provide a job ID, use --lane, or run from a workspace with a recent export.";

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) enum Subcommand {
    Bare,
    ListInvalidLimit { raw: String, json: bool },
    Simulate { lane: Option<String>, json: bool },
    NoArgJobOp { sub: &'static str, json: bool },
}

fn run(args: &[OsString]) -> io::Result<Outcome> {
    let Some(argv) = workspace_command::utf8_args(args) else {
        return Ok(Outcome::Declined("ripple arguments are not UTF-8".into()));
    };
    let Some(subcommand) = parse_subcommand(&argv[1..]) else {
        return Ok(Outcome::Declined("ripple remote subcommand delegated".into()));
    };
    let cwd = env::current_dir()?;
    let root_opt = workspace::root(&cwd);
    match subcommand {
        Subcommand::Bare => run_bare(&cwd, root_opt.as_deref(), args),
        Subcommand::ListInvalidLimit { raw, json } => {
            emit_invalid_limit(&cwd, root_opt.as_deref(), args, &raw, json)
        }
        Subcommand::Simulate { lane, json } => {
            run_simulate(&cwd, root_opt.as_deref(), args, lane.as_deref(), json)
        }
        Subcommand::NoArgJobOp { sub, json } => {
            run_no_arg_job_op(&cwd, root_opt.as_deref(), args, sub, json)
        }
    }
}

fn run_bare(cwd: &Path, root_opt: Option<&Path>, args: &[OsString]) -> io::Result<Outcome> {
    let report = Report { data: BARE_RIPPLE_MSG.into(), code: 1, details: None };
    if let Some(root) = root_opt {
        workspace_command::execute_then(root, args, "ripple", |_| Ok(report))
    } else {
        workspace_command::execute_with_scope(cwd, args, "ripple", &report)
    }
}

fn emit_invalid_limit(
    cwd: &Path,
    root_opt: Option<&Path>,
    args: &[OsString],
    raw: &str,
    json_flag: bool,
) -> io::Result<Outcome> {
    if env::var_os("CI").is_some_and(|val| !val.is_empty()) {
        return Ok(Outcome::Declined("CI ripple error delegated".into()));
    }
    let msg = format!(r#"invalid --limit value "{raw}": expected a positive integer"#);
    emit_ripple_error(cwd, root_opt, args, "list", json_flag, msg)
}

fn run_simulate(
    cwd: &Path,
    root_opt: Option<&Path>,
    args: &[OsString],
    lane_flag: Option<&str>,
    json_flag: bool,
) -> io::Result<Outcome> {
    if env::var_os("CI").is_some_and(|val| !val.is_empty()) {
        return Ok(Outcome::Declined("CI ripple simulate delegated".into()));
    }
    let Some(err) = diagnose_simulate_error(root_opt, lane_flag) else {
        return Ok(Outcome::Declined("ripple simulate remote call delegated".into()));
    };
    emit_ripple_error(cwd, root_opt, args, "simulate", json_flag, err)
}

fn diagnose_simulate_error(root_opt: Option<&Path>, lane_flag: Option<&str>) -> Option<String> {
    let (current_lane, is_exported) = read_workspace_lane_state(root_opt)?;
    let Some(lane) = lane_flag else {
        let Some(curr) = current_lane else {
            return Some(
                "a simulation requires a lane. switch to a lane or pass --lane <scope/lane-name>"
                    .into(),
            );
        };
        return (!is_exported).then(|| never_exported_err(&curr));
    };
    diagnose_simulate_lane_flag(lane, current_lane.as_deref(), is_exported)
}

fn diagnose_simulate_lane_flag(
    lane: &str,
    current_lane: Option<&str>,
    is_exported: bool,
) -> Option<String> {
    if lane == "main" {
        return Some(default_lane_err(lane));
    }
    let Some((_, name)) = lane
        .split_once('/')
        .filter(|(scope_str, name_str)| !scope_str.is_empty() && !name_str.is_empty())
    else {
        return Some(invalid_lane_err(lane));
    };
    if name == "main" {
        return Some(default_lane_err(lane));
    }
    (current_lane == Some(lane) && !is_exported).then(|| never_exported_err(lane))
}

fn never_exported_err(lane: &str) -> String {
    format!(
        r#"lane "{lane}" was never exported. a simulation runs against the lane on bit.cloud, run "bit export" first"#,
    )
}

fn default_lane_err(lane: &str) -> String {
    format!(
        r#""{lane}" is the default lane. a simulation needs a lane whose changes are tested against their dependents on main"#,
    )
}

fn invalid_lane_err(lane: &str) -> String {
    format!(
        r#"invalid --lane "{lane}", expected "scope/lane-name". unable to parse "{lane}" as a valid lane-id, expected "scope/lane-name" format"#,
    )
}

fn read_workspace_lane_state(root_opt: Option<&Path>) -> Option<(Option<String>, bool)> {
    let Some(root) = root_opt else {
        return Some((None, false));
    };
    let ws_val = parse_jsonc(&fs::read(root.join("workspace.jsonc")).ok()?).ok()?;
    if super::build_cmd::is_bitmap_auto_sync(&ws_val) {
        return None;
    }
    let bitmap = parse_jsonc(&fs::read(root.join(".bitmap")).ok()?).ok()?;
    let lane_obj = &bitmap["_bit_lane"];
    if lane_obj.is_null() {
        return Some((None, false));
    }
    let Some((scope, name)) = super::snap_distance::bitmap_lane_scope_and_name(&bitmap) else {
        return Some((None, false));
    };
    if name == "main" {
        return Some((None, false));
    }
    if scope.is_empty() {
        return None;
    }
    let exported = lane_obj["exported"].as_bool().unwrap_or(false);
    Some((Some(format!("{scope}/{name}")), exported))
}

fn run_no_arg_job_op(
    cwd: &Path,
    root_opt: Option<&Path>,
    args: &[OsString],
    sub: &'static str,
    json_flag: bool,
) -> io::Result<Outcome> {
    if let Some(root) = root_opt {
        let Some((None, _)) = read_workspace_lane_state(Some(root)) else {
            return Ok(Outcome::Declined("ripple job op on lane delegated".into()));
        };
        if workspace::scope_path(root).join("last-export.json").exists() {
            return Ok(Outcome::Declined("ripple job op with last-export delegated".into()));
        }
    }
    if json_flag {
        return emit_no_job_json(root_opt, args, sub);
    }
    let chalk = Chalk::detect(args);
    let report = Report { data: chalk.red(NO_JOB_MSG), code: 0, details: None };
    if let Some(root) = root_opt {
        workspace_command::execute_then(root, args, sub, |_| Ok(report))
    } else {
        workspace_command::execute_with_scope(cwd, args, sub, &report)
    }
}

fn emit_no_job_json(
    root_opt: Option<&Path>,
    args: &[OsString],
    sub: &'static str,
) -> io::Result<Outcome> {
    let val: Value = match sub {
        "log" => json!({ "job": null }),
        "errors" => {
            json!({ "error": "No job found", "job": null, "ciNodes": [], "containerLogs": {} })
        }
        _ => json!({ "error": NO_JOB_MSG }),
    };
    let data = serde_json::to_string_pretty(&val)?;
    if let Some(root) = root_opt {
        return workspace_command::execute_json(root, args, sub, |_| {
            Ok(Report { data, code: 0, details: None })
        });
    }
    let mut stdout = io::stdout().lock();
    stdout.write_all(data.as_bytes())?;
    stdout.flush()?;
    Ok(Outcome::Exit(ExitCode::SUCCESS))
}

fn emit_ripple_error(
    cwd: &Path,
    root_opt: Option<&Path>,
    args: &[OsString],
    command: &str,
    json_flag: bool,
    msg: String,
) -> io::Result<Outcome> {
    let err = io::Error::other(msg);
    if let Some(root) = root_opt {
        if json_flag {
            workspace_command::execute_json(root, args, command, |_| Err(err))
        } else {
            workspace_command::execute_then(root, args, command, |_| Err(err))
        }
    } else {
        workspace_command::execute_failure_scope(cwd, args, command, json_flag, "", err)
    }
}

pub(super) fn parse_subcommand(args: &[&str]) -> Option<Subcommand> {
    let filtered = args
        .iter()
        .copied()
        .filter(|arg| {
            !matches!(
                *arg,
                "--no-color"
                    | "--no-color=true"
                    | "--no-color=false"
                    | "--color"
                    | "--color=true"
                    | "--color=false"
                    | "--color=always"
                    | "--color=never",
            )
        })
        .collect::<Vec<_>>();
    match filtered.as_slice() {
        [] | ["--"] => Some(Subcommand::Bare),
        ["list", rest @ ..] if !rest.contains(&"--help") && !rest.contains(&"-h") => {
            parse_list_invalid_limit(rest)
        }
        ["simulate", rest @ ..] if !rest.contains(&"--help") && !rest.contains(&"-h") => {
            parse_simulate(rest)
        }
        [sub @ ("log" | "errors" | "retry" | "stop"), rest @ ..] => parse_no_arg_job_op(sub, rest),
        _ => None,
    }
}

fn parse_simulate(rest: &[&str]) -> Option<Subcommand> {
    let mut lane = None;
    let mut json = false;
    let mut iter = rest.iter().copied();
    while let Some(arg) = iter.next() {
        match arg {
            "--" => {
                return iter
                    .next()
                    .is_none()
                    .then_some(Subcommand::Simulate { lane, json });
            }
            "-j" | "--json" | "--json=true" => json = true,
            "--json=false" => json = false,
            "--lane" => {
                lane = Some(valid_ripple_val(iter.next()?)?.to_owned());
            }
            "--scopes" | "--owners" | "--exclude-scopes" => {
                valid_ripple_val(iter.next()?)?;
            }
            _ => apply_simulate_inline(arg, &mut lane)?,
        }
    }
    Some(Subcommand::Simulate { lane, json })
}

fn apply_simulate_inline(arg: &str, lane: &mut Option<String>) -> Option<()> {
    if let Some(val) = arg.strip_prefix("--lane=") {
        *lane = Some(valid_ripple_val(val)?.to_owned());
        return Some(());
    }
    let val = arg
        .strip_prefix("--scopes=")
        .or_else(|| arg.strip_prefix("--owners="))
        .or_else(|| arg.strip_prefix("--exclude-scopes="))?;
    valid_ripple_val(val).map(|_| ())
}

fn valid_ripple_val(val: &str) -> Option<&str> {
    let trimmed = val.trim();
    (!trimmed.is_empty() && !trimmed.starts_with('-')).then_some(trimmed)
}

fn parse_no_arg_job_op(sub: &str, rest: &[&str]) -> Option<Subcommand> {
    let sub_static = match sub {
        "log" => "log",
        "errors" => "errors",
        "retry" => "retry",
        "stop" => "stop",
        _ => return None,
    };
    let mut json = false;
    let mut iter = rest.iter().copied();
    while let Some(arg) = iter.next() {
        match arg {
            "--" => {
                return iter
                    .next()
                    .is_none()
                    .then_some(Subcommand::NoArgJobOp { sub: sub_static, json });
            }
            "-j" | "--json" | "--json=true" => json = true,
            "--json=false" => json = false,
            "--full-log" | "--full-log=true" | "--full-log=false" if sub_static == "errors" => {}
            _ => return None,
        }
    }
    Some(Subcommand::NoArgJobOp { sub: sub_static, json })
}

fn parse_list_invalid_limit(rest: &[&str]) -> Option<Subcommand> {
    let mut limit = None;
    let mut json = false;
    let mut idx = 0;
    while idx < rest.len() {
        match rest[idx] {
            "-j" | "--json" | "--json=true" => json = true,
            "--json=false" => json = false,
            "-l" | "--limit" => {
                idx += 1;
                limit = Some((*rest.get(idx)?).to_owned());
            }
            arg if let Some(val) = arg
                .strip_prefix("--limit=")
                .or_else(|| arg.strip_prefix("-l=")) =>
            {
                limit = Some(val.to_owned());
            }
            _ => {}
        }
        idx += 1;
    }
    let raw = limit?;
    if parse_positive_int(&raw).is_some() {
        return None;
    }
    Some(Subcommand::ListInvalidLimit { raw, json })
}

pub(super) fn parse_positive_int(raw: &str) -> Option<u64> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return None;
    }
    let val = trimmed.parse::<u64>().ok()?;
    (val >= 1).then_some(val)
}
