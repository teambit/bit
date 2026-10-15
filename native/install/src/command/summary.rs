//! `formatOutput` and `getAnotherInstallRequiredOutput` of `install.cmd.tsx`.

use crate::output::{Output, Style};
use std::time::Duration;

const DOCS: &str = "Read more about how to fix this issue in: https://bit.dev/blog/using-a-static-dependency-policy-in-a-legacy-env-lihfbt9b";

/// The final report.
pub fn format(
    output: &Output,
    components: usize,
    elapsed: Duration,
    recurring: bool,
    non_loaded: &[String],
) -> String {
    let summary = output.paint(
        Style::Green,
        &format!(
            "Successfully installed dependencies and compiled {} component(s) in {} seconds",
            output.paint(Style::Cyan, &components.to_string()),
            output.paint(Style::Cyan, &seconds(elapsed)),
        ),
    );
    match another_install_required(output, recurring, non_loaded) {
        Some(warning) => format!("\n{warning}\n\n{summary}"),
        None => format!("\n{summary}"),
    }
}

fn another_install_required(
    output: &Output,
    recurring: bool,
    non_loaded: &[String],
) -> Option<String> {
    if non_loaded.is_empty() {
        return None;
    }
    let command = output.paint(Style::Cyan, "bit install");
    let first =
        format!(r#"Bit was not able to install all dependencies. Please run "{command}" again "#);
    let flag = output.paint(Style::Cyan, "--recurring-install");
    let suggestion = if recurring {
        String::new()
    } else {
        format!(r#"(or use the "{flag}" option next time)."#)
    };
    let envs = format!(
        r#"The following environments need to add support for "dependency policy" to fix the warning: {}"#,
        output.paint(Style::Cyan, &non_loaded.join(", ")),
    );
    Some(output.paint(Style::Yellow, &format!("{first}{suggestion}\n{envs}\n{DOCS}")))
}

/// `(end - start) / 1000` printed as a JavaScript number.
fn seconds(elapsed: Duration) -> String {
    let millis = elapsed.as_millis();
    let fraction = millis % 1000;
    if fraction == 0 {
        return (millis / 1000).to_string();
    }
    format!("{}.{fraction:03}", millis / 1000).trim_end_matches('0').to_string()
}

#[cfg(test)]
mod tests;
