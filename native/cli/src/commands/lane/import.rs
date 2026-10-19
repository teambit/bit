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
    let Some(options) = super::super::switch::import_options(&argv[2..]) else {
        return Ok(Outcome::Declined("outside the native lane import grammar".into()));
    };
    let Some(root) = workspace::root(&env::current_dir()?) else {
        return Ok(Outcome::Declined("not inside a workspace".into()));
    };
    if options.force_ours && options.force_theirs {
        if root_callbacks(&root)? {
            return Ok(Outcome::Declined(
                "lane import validation requires configured provider startup".into(),
            ));
        }
        return workspace_command::execute_then(&root, args, "import", |_| {
            Err(io::Error::other("please use either --force-ours or --force-theirs, not both"))
        });
    }
    let (current, _) = match list::read_current(&root) {
        Ok(current) => current,
        Err(error) => return Ok(Outcome::Declined(format!("lane import: {error}"))),
    };
    if current["name"] == "main" {
        return super::super::switch::lane_import(args, argv);
    }
    if root_callbacks(&root)? {
        return Ok(Outcome::Declined(
            "active lane import requires configured provider startup".into(),
        ));
    }
    active(&root, args, &options.lane, &current)
}

fn active(
    root: &std::path::Path,
    args: &[OsString],
    lane: &str,
    current: &Value,
) -> io::Result<Outcome> {
    let current_id = format!(
        "{}/{}",
        current["scope"].as_str().unwrap_or_default(),
        current["name"].as_str().unwrap_or_default(),
    );
    let mut engine = Engine::new()?;
    let prepared = match super::super::import::prepare_lane_import(&mut engine, root, lane) {
        Ok(prepared) => prepared,
        Err(error) => return Ok(Outcome::Declined(format!("lane import: {error}"))),
    };
    let Some(lane) = prepared["laneImportId"].as_str() else {
        return Ok(Outcome::Declined("lane import resolved identity receipt".into()));
    };
    let Some(rows) = validate(&prepared, lane) else {
        return Ok(Outcome::Declined("lane import progress receipt".into()));
    };
    let report = report(lane, &current_id, Chalk::detect(args));
    workspace_command::execute_then(root, args, "import", |output| {
        apply(&mut engine, &prepared)?;
        for row in &rows {
            progress(output, row);
        }
        Ok(Report { data: report, code: 0, details: None })
    })
}

fn root_callbacks(root: &std::path::Path) -> io::Result<bool> {
    let config = bit_install::config::WorkspaceConfig::load(root)?;
    let core: Vec<String> = serde_json::from_str(include_str!(
        "../../../../../scopes/harmony/testing/load-aspect/core-aspects-ids.json"
    ))?;
    Ok(config.aspects
        .keys()
        .any(|id| {
            let id = bit_install::config::aspect_id_without_version(id);
            id.contains('/')
                && !core.iter().any(|core| core == id)
                && !bit_install::policy::is_core_env(id)
        }))
}

fn validate(prepared: &Value, lane: &str) -> Option<Vec<Value>> {
    if prepared["laneImport"] != true
        || prepared["laneFetch"] != true
        || prepared["token"].as_str().is_none()
    {
        return None;
    }
    let rows = prepared["progress"].as_array()?;
    if rows.is_empty()
        || rows.len() > 4096
        || rows[0]["reason"] != format!("for fetching lane {lane}")
    {
        return None;
    }
    for row in rows {
        row["reason"].as_str()?;
        if row["ids"].as_array()?.len() > 4096
            || row["components"].as_u64()? > 16384
            || row["objects"].as_u64()? > 16384
        {
            return None;
        }
    }
    Some(rows.clone())
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

fn progress(output: &Output, row: &Value) {
    let reason = row["reason"].as_str().unwrap();
    let count = row["ids"].as_array().unwrap().len();
    let imported = row["components"].as_u64().unwrap();
    let objects = row["objects"].as_u64().unwrap();
    output.restart(&format!("importing {count} components {reason}"));
    let (number, kind) = if imported > 0 { (imported, "components") } else { (objects, "objects") };
    output.restart(&format!("successfully imported {number} {kind} {reason}"));
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
