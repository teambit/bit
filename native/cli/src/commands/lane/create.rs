//! `bit lane create` for a local workspace on main.
use crate::{
    commands::{
        color::Chalk,
        workspace_command::{self, results::Report},
    },
    native::Outcome,
    workspace,
};
use bit_object_import::{
    lane_create::{Options as CreateOptions, Plan},
    parse_jsonc,
};
use serde_json::Value;
use sha1::{Digest, Sha1};
use std::{env, ffi::OsString, fs, io, path::Path};

struct Options<'a> {
    name: &'a str,
    scope: Option<&'a str>,
    alias: Option<&'a str>,
    fork_lane_new_scope: bool,
}

fn parse<'a>(args: &'a [&'a str]) -> Option<Options<'a>> {
    let mut options = Options { name: "", scope: None, alias: None, fork_lane_new_scope: false };
    let mut rest = args.iter().copied();
    while let Some(arg) = rest.next() {
        if arg == "--" {
            let name = rest.next()?;
            return (rest.next().is_none() && set_lane_name(&mut options.name, name)).then_some(
                options,
            );
        }
        if !arg.starts_with('-') {
            if !set_lane_name(&mut options.name, arg) {
                return None;
            }
        } else if !apply_create_flag(&mut options, arg, &mut rest) {
            return None;
        }
    }
    (!options.name.is_empty()).then_some(options)
}

fn set_lane_name<'a>(slot: &mut &'a str, name: &'a str) -> bool {
    if !slot.is_empty() || name.is_empty() {
        return false;
    }
    *slot = name;
    true
}

fn apply_create_flag<'a>(
    options: &mut Options<'a>,
    flag: &'a str,
    rest: &mut impl Iterator<Item = &'a str>,
) -> bool {
    if let Some(applied) = apply_create_inline(options, flag) {
        return applied;
    }
    match flag {
        "--no-color" => true,
        "--fork-lane-new-scope=false" => {
            options.fork_lane_new_scope = false;
            true
        }
        "--scope" | "-s" | "--remote-scope" => take_non_flag(&mut options.scope, rest),
        "--alias" => take_non_flag(&mut options.alias, rest),
        "--fork-lane-new-scope" | "--fork-lane-new-scope=true" => {
            options.fork_lane_new_scope = true;
            true
        }
        _ => false,
    }
}

fn apply_create_inline<'a>(options: &mut Options<'a>, flag: &'a str) -> Option<bool> {
    if let Some(val) = flag
        .strip_prefix("--scope=")
        .or_else(|| flag.strip_prefix("-s="))
        .or_else(|| flag.strip_prefix("--remote-scope="))
    {
        return Some(set_once(&mut options.scope, val));
    }
    flag.strip_prefix("--alias=").map(|val| set_once(&mut options.alias, val))
}

fn set_once<'a>(slot: &mut Option<&'a str>, val: &'a str) -> bool {
    if slot.is_some() || val.is_empty() || val.starts_with('-') {
        return false;
    }
    *slot = Some(val);
    true
}

fn take_non_flag<'a>(slot: &mut Option<&'a str>, rest: &mut impl Iterator<Item = &'a str>) -> bool {
    let Some(val) = rest.next() else {
        return false;
    };
    set_once(slot, val)
}

pub(super) fn run(args: &[OsString], lane_args: &[&str]) -> io::Result<Outcome> {
    let Some(options) = parse(lane_args) else {
        return Ok(Outcome::Declined("outside the native lane create grammar".into()));
    };
    let root = match resolve_workspace_or_fail(
        args,
        "create",
        super::super::log::OUTSIDE_WORKSPACE_ERR,
    )? {
        Ok(root) => root,
        Err(outcome) => return Ok(outcome),
    };
    let scope =
        if let Some(scope) = options.scope { scope.to_string() } else { default_scope(&root)? };
    let Some(scope) = (!scope.is_empty()).then_some(scope) else {
        return Ok(Outcome::Declined("lane create needs a default scope".into()));
    };
    let user = workspace_command::User::load(&root)?;
    let lane_hash = format!("{:x}", Sha1::digest(workspace_command::uuid_v4()?.as_bytes()));
    let plan = match Plan::prepare(
        &root,
        options.name,
        &scope,
        CreateOptions {
            alias: options.alias.unwrap_or(options.name),
            fork_lane_new_scope: options.fork_lane_new_scope,
        },
        user.log(),
        &lane_hash,
        &workspace_command::uuid_v4()?,
    ) {
        Ok(plan) => plan,
        Err(error) => return Ok(Outcome::Declined(format!("lane create: {error}"))),
    };
    let report = report(&plan, &options, Chalk::detect(args));
    workspace_command::execute_with(&root, args, "create", &report, |_| plan.commit())
}

pub(super) fn merge_move(args: &[OsString], lane_args: &[&str]) -> io::Result<Outcome> {
    let Some(options) =
        parse(lane_args).filter(|opt| opt.alias.is_none() && !opt.fork_lane_new_scope)
    else {
        return Ok(Outcome::Declined("outside the native lane merge-move grammar".into()));
    };
    let root = match resolve_workspace_or_fail(
        args,
        "merge-move",
        "this command makes sense only when checked out to a lane. otherwise, there is no lane to revert to.\nin order to move all local merge changes to a new lane, you can simply create a new lane (bit lane create)",
    )? {
        Ok(root) => root,
        Err(outcome) => return Ok(outcome),
    };
    if let Some(err_msg) = validate_merge_move_state(&root)? {
        return workspace_command::execute_then(&root, args, "merge-move", |_| {
            Err(io::Error::other(err_msg))
        });
    }
    let scope =
        if let Some(scope) = options.scope { scope.to_string() } else { default_scope(&root)? };
    let Some(scope) = (!scope.is_empty()).then_some(scope) else {
        return Ok(Outcome::Declined("lane merge-move needs a default scope".into()));
    };
    let user = workspace_command::User::load(&root)?;
    let lane_hash = format!("{:x}", Sha1::digest(workspace_command::uuid_v4()?.as_bytes()));
    let plan = match Plan::prepare_merge_move(
        &root,
        options.name,
        &scope,
        user.log(),
        &lane_hash,
        &workspace_command::uuid_v4()?,
    ) {
        Ok(plan) => plan,
        Err(error) => return Ok(Outcome::Declined(format!("lane merge-move: {error}"))),
    };
    let report = merge_move_report(&plan, &options, Chalk::detect(args));
    workspace_command::execute_with(&root, args, "merge-move", &report, |_| plan.commit())
}

fn resolve_workspace_or_fail(
    args: &[OsString],
    command: &'static str,
    err_msg: &'static str,
) -> io::Result<Result<std::path::PathBuf, Outcome>> {
    let cwd = env::current_dir()?;
    if let Some(root) = workspace::root(&cwd) {
        return Ok(Ok(root));
    }
    if env::var_os("CI").is_some_and(|val| !val.is_empty()) {
        return Ok(Err(Outcome::Declined("CI lane outside workspace".into())));
    }
    workspace_command::execute_failure_scope(
        &cwd,
        args,
        command,
        false,
        "",
        io::Error::other(err_msg),
    )
    .map(Err)
}

fn validate_merge_move_state(root: &Path) -> io::Result<Option<String>> {
    let bitmap: Value = parse_jsonc(&fs::read(root.join(".bitmap"))?)?;
    if bitmap["_bit_lane"].is_null() || bitmap["_bit_lane"]["id"]["name"] == "main" {
        return Ok(Some(
            "this command makes sense only when checked out to a lane. otherwise, there is no lane to revert to.\nin order to move all local merge changes to a new lane, you can simply create a new lane (bit lane create)".to_owned(),
        ));
    }
    let last_merged = bit_object_import::scope_path(root).join("last-merged");
    if !last_merged.exists() {
        return Ok(Some(
            r#"unable to abort the last lane-merge because "bit export" was running since then"#
                .to_owned(),
        ));
    }
    if !last_merged.join("lane").is_file() {
        return Ok(Some(format!(
            "unable to revert the last lane-merge because the lane is missing from {}",
            last_merged.display(),
        )));
    }
    Ok(None)
}

fn merge_move_report(plan: &Plan, options: &Options<'_>, chalk: Chalk) -> Report {
    let formatter = crate::commands::workspace_command::format::Formatter::new(chalk);
    let scope = chalk.bold(plan.scope());
    let remote_scope_or_default = if options.scope.is_some() {
        format!("the remote scope {scope}")
    } else {
        format!(
            r#"the default-scope {scope}. you can change the lane's scope, before it is exported, with the "bit lane change-scope" command"#,
        )
    };
    let parent_name = plan.parent_name().unwrap_or_default();
    let title = formatter.success_summary(&format!(
        "added and checked out to the new lane {} based on lane {}",
        chalk.bold(options.name),
        chalk.bold(parent_name),
    ));
    let remote_scope_output =
        formatter.hint(&format!("this lane will be exported to {remote_scope_or_default}"));
    Report {
        data: crate::commands::workspace_command::format::Formatter::join(&[
            title,
            remote_scope_output,
        ]),
        code: 0,
        details: None,
    }
}

fn report(plan: &Plan, options: &Options<'_>, chalk: Chalk) -> Report {
    let display = chalk.bold(options.alias.unwrap_or(options.name));
    let formatter = crate::commands::workspace_command::format::Formatter::new(chalk);
    let scope = chalk.bold(plan.scope());
    let note = if options.scope.is_some() {
        format!("this lane will be exported to the remote scope {scope}")
    } else {
        format!(
            r#"this lane will be exported to the default-scope {scope}. you can change the lane's scope, before it is exported, with the "bit lane change-scope" command"#,
        )
    };
    let parent_note = plan
        .parent_name()
        .map_or(String::new(), |parent| {
            formatter.hint(&format!("note - your new lane will be based on lane {parent}"))
        });
    let moved = plan
        .moved_from_main()
        .iter()
        .map(|id| formatter.item(id))
        .collect::<Vec<_>>();
    Report {
        data: crate::commands::workspace_command::format::Formatter::join(&[
            formatter.success_summary(&format!(
                "successfully created and checked out to lane {display}",
            )),
            parent_note,
            formatter.section("moved from main", "these components had snaps on main that were not exported. the snaps were moved to the new lane", &moved),
            formatter.hint(&note),
        ]),
        code: 0,
        details: None,
    }
}

fn default_scope(root: &Path) -> io::Result<String> {
    let bitmap: Value = parse_jsonc(&fs::read(root.join(".bitmap"))?)?;
    if let Some(scope) = bitmap["_bit_lane"]["id"]["scope"].as_str() {
        return Ok(scope.to_owned());
    }
    let config: Value = parse_jsonc(&fs::read(root.join("workspace.jsonc"))?)?;
    Ok(config["teambit.workspace/workspace"]["defaultScope"]
        .as_str()
        .unwrap_or_default()
        .to_owned())
}
