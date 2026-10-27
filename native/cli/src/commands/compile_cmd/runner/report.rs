//! `CompileCmd` reports retain emitted paths, diagnostics and per-component status.
use super::{Compiled, Options};
use crate::commands::{
    color::Chalk,
    workspace_command::{format::Formatter, results::Report},
};
use serde_json::{Value, json};
use std::{ffi::OsString, io, time::Duration};

pub(super) fn create(
    rows: &[Compiled],
    options: &Options,
    args: &[OsString],
    elapsed: Duration,
) -> io::Result<Report> {
    let failures = rows
        .iter()
        .filter(|row| !row.errors.is_empty())
        .count();
    let data = if options.json {
        serde_json::to_string_pretty(&json_rows(rows))?
    } else {
        text(rows, options.verbose, Chalk::detect(args), elapsed, failures)
    };
    Ok(Report { data, code: i32::from(!options.json && failures > 0), details: None })
}

fn json_rows(rows: &[Compiled]) -> Vec<Value> {
    rows.iter().map(|row| json!({"component":row.identity,
        "buildResults":row.files.iter().map(|file|&file.path).collect::<Vec<_>>(),
        "errors":row.errors.iter().map(|error|json!({"path":error.path,"error":{}})).collect::<Vec<_>>()
    })).collect()
}

fn text(
    rows: &[Compiled],
    verbose: bool,
    chalk: Chalk,
    elapsed: Duration,
    failures: usize,
) -> String {
    let formatter = Formatter::new(chalk);
    let items = rows
        .iter()
        .filter(|row| verbose || !row.errors.is_empty())
        .map(|row| item(row, verbose, &formatter))
        .collect::<Vec<_>>()
        .join(if verbose { "\n\n" } else { "\n" });
    let count = rows.len();
    let summary = if failures == 0 {
        formatter.success_summary(&format!("{count}/{count} components compiled successfully."))
    } else {
        format!(
            "{} {}",
            formatter.warn_symbol(),
            formatter.chalk.yellow(&format!("{failures}/{count} components failed to compile.")),
        )
    };
    let timing =
        formatter.hint(&format!("Finished. ({})", bit_install::output::pretty_time(elapsed)));
    Formatter::join(&[items, format!("{summary}\n{timing}")])
}

fn item(row: &Compiled, verbose: bool, formatter: &Formatter) -> String {
    let mut line = if row.errors.is_empty() {
        formatter.item(&row.identity)
    } else {
        Formatter::item_with(&format!("{} ... failed", row.identity), &formatter.error_symbol())
    };
    if verbose && !row.files.is_empty() {
        line.push('\n');
        line.push_str(
            &row.files
                .iter()
                .map(|file| format!("\t\t - {}", file.path.display()))
                .collect::<Vec<_>>()
                .join("\n"),
        );
    }
    line
}

pub(super) fn errors(row: &Compiled, output: &bit_install::output::Output) {
    if row.errors.is_empty() {
        return;
    }
    let errors = row.errors
        .iter()
        .map(|error| format!("{}\nError: {}", error.path.display(), error.message))
        .collect::<Vec<_>>()
        .join("\n");
    output.console(&format!(
        "compilation failed. see the following errors from the compiler\n{errors}",
    ));
}
