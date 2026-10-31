//! `ImportCmd.json` and its quiet command-owned execution.
use super::{options::Options, workspace_command};
use crate::native::Outcome;
use bit_install::output::Output;
use serde_json::{Value, json};
use std::{ffi::OsString, io, path::Path};
use workspace_command::results::Report;

pub(super) fn execute(
    root: &Path,
    args: &[OsString],
    options: &Options,
    work: impl FnOnce(&Output) -> io::Result<Report>,
) -> io::Result<Outcome> {
    if options.output.json {
        workspace_command::execute_json(root, args, options.operation, work)
    } else {
        workspace_command::execute_then(root, args, options.operation, work)
    }
}

pub(super) fn json_report(
    prepared: &Value,
    installation_error: bool,
    compilation_error: bool,
) -> io::Result<String> {
    let mut report = json!({"importDetails":prepared["importDetails"],"missingIds":[]});
    if installation_error {
        report["installationError"] = json!({});
    }
    if compilation_error {
        report["compilationError"] = json!({});
    }
    serde_json::to_string_pretty(&report).map_err(io::Error::other)
}

/// `listing remote components` per pattern, then `NoIdMatchWildcard` warnings.
pub(super) fn selection(
    options: &Options,
    selection: &super::patterns::Selection,
    output: &Output,
) {
    if options.wildcards().is_empty() {
        return;
    }
    output.status("importing components");
    if !options.selection.lane_only {
        for _ in options.wildcards() {
            output.status("listing remote components");
        }
    }
    for warning in &selection.warnings {
        output.warning(warning);
    }
}

pub(super) fn validate_lane_groups(prepared: &Value, options: &Options) -> io::Result<()> {
    let Some(groups) = prepared
        .get("laneGroups")
        .filter(|value| !value.is_null())
    else {
        if options.lanes && options.ids.len() > 1 {
            return Err(io::Error::other("native inbound lane groups"));
        }
        return Ok(());
    };
    let rows = prepared["progress"]
        .as_array()
        .ok_or_else(|| io::Error::other("native inbound progress"))?;
    let counts = groups.as_array().ok_or_else(|| io::Error::other("native inbound lane groups"))?;
    if !options.lanes
        || !valid_group_count(counts.len(), prepared["mainFetch"] == true, options.ids.len())
        || counts
            .iter()
            .enumerate()
            .any(|(index, count)| {
                count
                    .as_u64()
                    .is_none_or(|count| {
                        count == 0 && !(prepared["mainFetch"] == true && index == 0)
                    })
            })
        || counts
            .iter()
            .filter_map(Value::as_u64)
            .sum::<u64>()
            != rows.len() as u64
    {
        return Err(io::Error::other("native inbound lane groups"));
    }
    Ok(())
}

fn valid_group_count(count: usize, main: bool, selected: usize) -> bool {
    if main { (1..=33).contains(&count) } else { (1..=32).contains(&count) && count == selected }
}

pub(super) fn empty(
    root: &Path,
    args: &[OsString],
    options: &Options,
    selected: &super::patterns::Selection,
    chalk: super::Chalk,
) -> io::Result<Outcome> {
    execute(root, args, options, |output| {
        let started = std::time::Instant::now();
        selection(options, selected, output);
        output.status("importing components");
        output.status("import 0 components with their dependencies (if missing)");
        output.success("importing components", Some(started));
        Ok(Report {
            data: if options.output.json {
                json_report(&json!({"importDetails":[]}), false, false)?
            } else {
                chalk.yellow("nothing to import")
            },
            code: 0,
            details: None,
        })
    })
}
