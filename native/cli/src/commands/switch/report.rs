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
    let results = hydrate(result)?;
    if results.snaps.is_some()
        || results.snap_error.is_some()
        || results.version.is_some()
    {
        return Err(decline("native switch report shape"));
    }
    let formatter = Formatter::new(chalk);
    let skipped_minimal = !results.skipped.is_empty() && !options.verbose;
    let data = build(&results, options, &formatter, skipped_minimal);
    let details = skipped_minimal.then(|| build(&results, options, &formatter, false));
    Ok(Report { data, code: 0, details })
}

fn build(results: &Results, options: &Options, formatter: &Formatter, minimal: bool) -> String {
    let failure = if results.skipped.is_empty() {
        String::new()
    } else if minimal {
        formatter.details_hint(&format!(
            "full list of {} skipped component(s)",
            results.skipped.len(),
        ))
    } else {
        let items: Vec<String> = results.skipped
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
    };
    let lane_success = formatter.success_summary(&format!(
        r#"successfully set "{}" as the active lane"#,
        formatter.chalk.bold(&options.lane),
    ));
    let success = if results.components.is_empty() {
        format!("No components have been changed.\n{lane_success}")
    } else {
        let head = if options.skip_fetch { "local head" } else { "head" };
        let title = formatter.success_summary(&format!(
            "successfully switched {} components to the {head} of lane {}",
            results.components.len(),
            options.lane,
        ));
        join_lines(&[title, results.apply_version_report(formatter, true, false), lane_success])
    };
    Formatter::join(&[failure, success])
}
