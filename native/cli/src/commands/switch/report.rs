//! `SwitchCmd.report` for local lane switches.

#[cfg(test)]
mod report_tests;

use super::options::Options;
use crate::commands::{
    color::Chalk,
    status::js::decline,
    workspace_command::{
        format::Formatter,
        results::{Report, Results, hydrate, join_lines},
    },
};
use serde_json::Value;
use std::io;

pub fn format(result: &Value, options: &Options, chalk: Chalk) -> io::Result<Report> {
    if options.lane.trim().is_empty() {
        return Err(decline("native switch lane name"));
    }
    let results = hydrate(result)?;
    if results.snaps.is_some()
        || results.snap_error.is_some()
        || results.version.is_some()
    {
        return Err(decline("native switch report shape"));
    }
    let formatter = Formatter::new(chalk);
    let branch_warning = result["gitBranchWarning"]
        .as_str()
        .map(str::trim)
        .filter(|warning| !warning.is_empty())
        .map(|warning| chalk.yellow(&format!("Warning: {warning}")))
        .unwrap_or_default();
    let skipped_minimal = !results.skipped.is_empty() && !options.verbose;
    let data = build(&results, options, &formatter, &branch_warning, skipped_minimal);
    let details =
        skipped_minimal.then(|| build(&results, options, &formatter, &branch_warning, false));
    Ok(Report { data, code: 0, details })
}

fn build(
    results: &Results,
    options: &Options,
    formatter: &Formatter,
    branch_warning: &str,
    minimal: bool,
) -> String {
    let failure = format_skipped(&results.skipped, formatter, minimal);
    let lane_name = options.lane.trim();
    let lane_success = formatter.success_summary(&format!(
        r#"successfully set "{}" as the active lane"#,
        formatter.chalk.bold(lane_name),
    ));
    let success = if results.components.is_empty() {
        format!("No components have been changed.\n{lane_success}")
    } else {
        let head = if options.skip_fetch { "local head" } else { "head" };
        let title = formatter.success_summary(&format!(
            "successfully switched {} components to the {head} of lane {lane_name}",
            results.components.len(),
        ));
        join_lines(&[title, results.apply_version_report(formatter, true, false), lane_success])
    };
    Formatter::join(&[failure, success, branch_warning.to_owned()])
}

fn format_skipped(
    skipped: &[(crate::commands::ids::Id, String)],
    formatter: &Formatter,
    minimal: bool,
) -> String {
    if skipped.is_empty() {
        String::new()
    } else if minimal {
        formatter.details_hint(&format!("full list of {} skipped component(s)", skipped.len()))
    } else {
        let items: Vec<String> = skipped
            .iter()
            .map(|(id, message)| {
                formatter.item(&format!(
                    "{} - {}",
                    formatter.chalk.bold(&id.display()),
                    message.trim(),
                ))
            })
            .collect();
        formatter.section("switch skipped", "", &items)
    }
}
