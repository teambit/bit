//! Native lane import on main switches; on another lane it publishes the
//! fetched Lane and component objects without changing the workspace.

use super::{
    super::{
        color::Chalk,
        engine::Engine,
        workspace_command::{self, format::Formatter, results::Report},
    },
    list,
};
use crate::{native::Outcome, workspace};
use bit_install::output::Output;
use serde_json::{Value, json};
use std::{env, ffi::OsString, io};

pub(super) fn run(args: &[OsString], argv: &[&str]) -> io::Result<Outcome> {
    let Some(root) = workspace::root(&env::current_dir()?) else {
        return Ok(Outcome::Declined("not inside a workspace".into()));
    };
    let (current, _) = match list::read_current(&root) {
        Ok(current) => current,
        Err(error) => return Ok(Outcome::Declined(format!("lane import: {error}"))),
    };
    if current["name"] == "main" {
        return super::super::switch::lane_import(args, argv);
    }
    let Some(lane) = scoped_lane(argv) else {
        return Ok(Outcome::Declined("outside the native active lane import grammar".into()));
    };
    let current_id = format!(
        "{}/{}",
        current["scope"].as_str().unwrap_or_default(),
        current["name"].as_str().unwrap_or_default(),
    );
    let mut engine = Engine::new()?;
    let prepared = match super::super::import::prepare_lane_import(&mut engine, &root, lane) {
        Ok(prepared) => prepared,
        Err(error) => return Ok(Outcome::Declined(format!("lane import: {error}"))),
    };
    let Some((count, imported, objects)) = validate(&prepared, lane) else {
        return Ok(Outcome::Declined("lane import progress receipt".into()));
    };
    let report = report(lane, &current_id, Chalk::detect(args));
    workspace_command::execute_then(&root, args, "import", |output| {
        apply(&mut engine, &prepared)?;
        progress(output, lane, count, imported, objects);
        Ok(Report { data: report, code: 0, details: None })
    })
}

fn scoped_lane<'a>(argv: &[&'a str]) -> Option<&'a str> {
    let ["lane", "import", lane, flags @ ..] = argv else { return None };
    let (scope, name) = lane.split_once('/')?;
    if scope.is_empty()
        || name.is_empty()
        || name.contains('/')
        || !scope
            .bytes()
            .chain(name.bytes())
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'-' | b'_'))
        || flags
            .iter()
            .any(|flag| !matches!(*flag, "-x" | "--skip-dependency-installation"))
    {
        return None;
    }
    Some(lane)
}

fn validate(prepared: &Value, lane: &str) -> Option<(u64, u64, u64)> {
    if prepared["laneImport"] != true
        || prepared["laneFetch"] != true
        || prepared["token"].as_str().is_none()
    {
        return None;
    }
    let rows = prepared["progress"].as_array()?;
    if rows.len() != 1 || rows[0]["reason"] != format!("for fetching lane {lane}") {
        return None;
    }
    let count = rows[0]["ids"].as_array()?.len() as u64;
    let imported = rows[0]["components"].as_u64()?;
    let objects = rows[0]["objects"].as_u64()?;
    (count <= 4096 && imported <= 16384 && objects <= 16384).then_some((count, imported, objects))
}

fn apply(engine: &mut Engine, prepared: &Value) -> io::Result<()> {
    let applied: Value =
        engine.request(&json!({"kind":"commandInboundApply","token":prepared["token"]}))?;
    if applied["applied"] != true
        || applied["token"] != prepared["token"]
        || applied["laneImport"] != true
        || applied["progress"] != prepared["progress"]
    {
        return Err(io::Error::other("lane import publication receipt"));
    }
    Ok(())
}

fn progress(output: &Output, lane: &str, count: u64, imported: u64, objects: u64) {
    output.restart(&format!("importing {count} components for fetching lane {lane}"));
    let (number, kind) = if imported > 0 { (imported, "components") } else { (objects, "objects") };
    output.restart(&format!("successfully imported {number} {kind} for fetching lane {lane}"));
}

fn report(lane: &str, current: &str, chalk: Chalk) -> String {
    let format = Formatter::new(chalk);
    if lane == current {
        return Formatter::join(&[
            format.success_summary(&format!(
                r#"you are already on lane "{}". the lane has been fetched from the remote, but your workspace files were {} updated."#,
                chalk.bold(lane), chalk.bold("not"),
            )),
            format!(r#"{}, run "{}"."#, chalk.yellow("to update your workspace files to the latest"), chalk.bold("bit checkout head")),
        ]);
    }
    Formatter::join(&[
        format.success_summary(&format!(r#"imported lane "{}" locally"#, chalk.bold(lane))),
        format.hint(&format!(r#"you are still on lane "{current}". to switch to the imported lane, run "bit switch {lane}""#)),
    ])
}
