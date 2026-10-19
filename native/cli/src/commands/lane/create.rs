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
    let (name, rest) = args.split_first()?;
    let mut options = Options { name, scope: None, alias: None, fork_lane_new_scope: false };
    let mut rest = rest.iter().copied();
    while let Some(flag) = rest.next() {
        match flag {
            "--scope" | "-s" | "--remote-scope" if options.scope.is_none() => {
                options.scope = Some(rest.next()?);
            }
            "--alias" if options.alias.is_none() => options.alias = Some(rest.next()?),
            "--fork-lane-new-scope" if !options.fork_lane_new_scope => {
                options.fork_lane_new_scope = true;
            }
            _ => return None,
        }
    }
    Some(options)
}

pub(super) fn run(args: &[OsString], lane_args: &[&str]) -> io::Result<Outcome> {
    let Some(options) = parse(lane_args) else {
        return Ok(Outcome::Declined("outside the native lane create grammar".into()));
    };
    let Some(root) = workspace::root(&env::current_dir()?) else {
        return Ok(Outcome::Declined("not inside a workspace".into()));
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
            format!("\nnote - your new lane will be based on lane {}\n", chalk.bold(parent))
        });
    Report {
        data: format!(
            "{}\n{parent_note}\n{note}",
            formatter.success_summary(&format!(
                "successfully created and checked out to lane {display}"
            )),
        ),
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
