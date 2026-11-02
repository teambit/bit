//! `SwitchCmd.report` for local lane switches.
//!
//! [`format`] renders lane switch [`Report`] payloads for [`Options`] with [`Chalk`] and declines unsupported receipts via [`decline`].

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

/// Formats the `SwitchCmd.report` human-readable [`Report`] for a lane switch `result` [`Value`].
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
        .map_or_else(String::new, |warning| chalk.yellow(&format!("Warning: {warning}")));
    let skipped_minimal = !results.skipped.is_empty() && !options.verbose;
    let success = success_section(&results, options, &formatter);
    let data = Formatter::join(&[
        format_skipped(&results.skipped, &formatter, skipped_minimal),
        success.clone(),
        branch_warning.clone(),
    ]);
    let details = skipped_minimal.then(|| {
        Formatter::join(&[
            format_skipped(&results.skipped, &formatter, false),
            success,
            branch_warning,
        ])
    });
    Ok(Report { data, code: 0, details })
}

/// Formats the component switch summary and active-lane confirmation line for `results` ([`Results`]).
#[inline]
fn success_section(results: &Results, options: &Options, formatter: &Formatter) -> String {
    let lane_name = options.lane.trim();
    let lane_success = formatter.success_summary(&format!(
        r#"successfully set "{}" as the active lane"#,
        formatter.chalk.bold(lane_name),
    ));
    if results.components.is_empty() {
        format!("No components have been changed.\n{lane_success}")
    } else {
        let head = if options.skip_fetch { "local head" } else { "head" };
        let title = formatter.success_summary(&format!(
            "successfully switched {} components to the {head} of lane {lane_name}",
            results.components.len(),
        ));
        join_lines(&[title, results.apply_version_report(formatter, true, false), lane_success])
    }
}

/// Formats the `switch skipped` section or its minimal `--details` hint.
#[inline]
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
