//! Local lane removal after selecting and validating every target.

use super::{
    super::{
        color::Chalk,
        workspace_command::{self, results::Report},
    },
    list,
};
use crate::{native::Outcome, workspace};
use bit_object_import::lane_remove::Plan;
use std::{env, ffi::OsString, io};

pub(super) fn run(args: &[OsString], lane_args: &[&str]) -> io::Result<Outcome> {
    let Some((names, force, remote)) = parse(lane_args) else {
        return Ok(Outcome::Declined("outside the native local lane remove grammar".into()));
    };
    if remote {
        if names
            .iter()
            .any(|name| !name.contains('/'))
        {
            return Ok(Outcome::Declined("remote lane ID requires its scope".into()));
        }
        return crate::commands::delete::hard::lanes(args, &names, force);
    }
    let cwd = env::current_dir()?;
    let Some(root) = workspace::root(&cwd) else {
        return outside_workspace_remove(&cwd, args);
    };
    let (lanes, _) = match list::read_with_merge(&root, !force) {
        Ok(lanes) => lanes,
        Err(error) => return Ok(Outcome::Declined(format!("lane remove: {error}"))),
    };
    let ids = match select(&names, &lanes, force) {
        Ok(ids) => ids,
        Err(error) => return Ok(Outcome::Declined(format!("lane remove: {error}"))),
    };
    let plan = match Plan::prepare(&root, &ids) {
        Ok(plan) => plan,
        Err(error) => return Ok(Outcome::Declined(format!("lane remove: {error}"))),
    };
    let chalk = Chalk::detect(args);
    let report = Report {
        data: chalk.green(&format!(
            "successfully removed the following lane(s): {}",
            chalk.bold(&names.join(", ")),
        )),
        code: 0,
        details: None,
    };
    workspace_command::execute_with(&root, args, "remove", &report, |_| plan.commit())
}

fn outside_workspace_remove(cwd: &std::path::Path, args: &[OsString]) -> io::Result<Outcome> {
    if super::scope_root::discover()
        .ok()
        .flatten()
        .is_none()
        && env::var_os("CI").is_none_or(|val| val.is_empty())
    {
        return workspace_command::execute_failure_scope(
            cwd,
            args,
            "remove",
            false,
            "",
            io::Error::other("Cannot read properties of undefined (reading 'legacyScope')"),
        );
    }
    Ok(Outcome::Declined("not inside a workspace".into()))
}

fn parse(args: &[&str]) -> Option<(Vec<String>, bool, bool)> {
    let mut names = Vec::new();
    let mut force = false;
    let mut silent = false;
    let mut remote = false;
    let mut iter = args.iter().copied();
    while let Some(arg) = iter.next() {
        match arg {
            "--" => {
                consume_trailing_remove_names(iter, &mut names)?;
                break;
            }
            "-f" | "--force" | "--force=true" => force = true,
            "--force=false" => force = false,
            "-s" | "--silent" | "--silent=true" => silent = true,
            "--silent=false" => silent = false,
            "-r" | "--remote" | "--remote=true" => remote = true,
            "--remote=false" => remote = false,
            name if !name.starts_with('-') && name.len() <= 256 && names.len() < 32 => {
                names.push(name.to_owned());
            }
            short => apply_remove_short_bundle(short, &mut force, &mut silent, &mut remote)?,
        }
    }
    (silent && !names.is_empty()).then_some((names, force, remote))
}

fn consume_trailing_remove_names<'a>(
    iter: impl Iterator<Item = &'a str>,
    names: &mut Vec<String>,
) -> Option<()> {
    for name in iter {
        (!name.is_empty() && !name.starts_with('-') && name.len() <= 256 && names.len() < 32)
            .then_some(())?;
        names.push(name.to_owned());
    }
    Some(())
}

fn apply_remove_short_bundle(
    arg: &str,
    force: &mut bool,
    silent: &mut bool,
    remote: &mut bool,
) -> Option<()> {
    let flags = arg
        .strip_prefix('-')
        .filter(|flags| !flags.is_empty() && !flags.starts_with('-'))?;
    for ch in flags.chars() {
        match ch {
            'f' => *force = true,
            's' => *silent = true,
            'r' => *remote = true,
            _ => return None,
        }
    }
    Some(())
}

fn select(names: &[String], lanes: &[list::LaneData], force: bool) -> io::Result<Vec<String>> {
    names
        .iter()
        .map(|name| {
            let matched = lanes
                .iter()
                .filter(|lane| {
                    !lane.is_main()
                        && (lane.id["name"] == *name
                            || lane.alias.as_deref() == Some(name)
                            || format!(
                                "{}/{}",
                                lane.id["scope"].as_str().unwrap_or_default(),
                                lane.id["name"].as_str().unwrap_or_default(),
                            ) == *name)
                })
                .collect::<Vec<_>>();
            let [lane] = matched.as_slice() else {
                return Err(io::Error::other("lane name is missing or ambiguous"));
            };
            if !force && lane.is_merged != Some(true) {
                return Err(io::Error::other("lane is not fully merged"));
            }
            Ok(format!(
                "{}/{}",
                lane.id["scope"].as_str().unwrap_or_default(),
                lane.id["name"].as_str().unwrap_or_default(),
            ))
        })
        .collect()
}
