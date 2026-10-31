//! The workspace command history the Node.js CLI's logger keeps:
//! `<scope>/command-history`, one line when a command starts and one when it
//! ends, `<ISO time> <pid> <arguments>, started|succeeded|failed`.

#[cfg(test)]
mod history_tests;

use crate::workspace;
use std::{
    ffi::OsString,
    fs::OpenOptions,
    io::Write,
    path::{Path, PathBuf},
    process,
    time::{SystemTime, UNIX_EPOCH},
};

pub struct History {
    file: PathBuf,
    command: String,
}

impl History {
    /// Record the start of the command `args` (starting at the command name).
    pub fn start(root: &Path, args: &[OsString]) -> Self {
        Self::start_scope(&workspace::scope_path(root), args)
    }

    /// Prepare a workspace command history handle for safe-mode commands that
    /// load the consumer after `CLIParser.parse()`, writing only the completion
    /// entry on `end`.
    pub fn unstarted(root: &Path, args: &[OsString]) -> Self {
        Self {
            file: workspace::scope_path(root).join("command-history"),
            command: Self::format_command(args),
        }
    }

    /// Record a command using the actual consumer scope directory.
    pub fn start_scope(scope: &Path, args: &[OsString]) -> Self {
        let history =
            Self { file: scope.join("command-history"), command: Self::format_command(args) };
        history.write("started");
        history
    }

    fn format_command(args: &[OsString]) -> String {
        args.iter()
            .map(|arg| arg.to_string_lossy())
            .collect::<Vec<_>>()
            .join(" ")
    }

    pub fn end(&self, succeeded: bool) {
        self.write(if succeeded { "succeeded" } else { "failed" });
    }

    /// Best effort, as in Node: a scope that cannot be written loses the line.
    fn write(&self, state: &str) {
        let line = format!("{} {} {}, {state}\n", iso_now(), process::id(), self.command);
        if let Ok(mut file) = OpenOptions::new()
            .append(true)
            .create(true)
            .open(&self.file)
        {
            let _ = file.write_all(line.as_bytes());
        }
    }
}

/// `new Date().toISOString()`: UTC with milliseconds.
pub fn iso_now() -> String {
    let elapsed = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default();
    iso(elapsed.as_millis() as i64)
}

fn iso(millis: i64) -> String {
    let (days, time) = (millis.div_euclid(86_400_000), millis.rem_euclid(86_400_000));
    let (year, month, day) = civil(days);
    let (hours, minutes) = (time / 3_600_000, time / 60_000 % 60);
    let (seconds, millis) = (time / 1000 % 60, time % 1000);
    format!("{year:04}-{month:02}-{day:02}T{hours:02}:{minutes:02}:{seconds:02}.{millis:03}Z")
}

/// Days since 1970-01-01 to a proleptic Gregorian date (Howard Hinnant's algorithm).
fn civil(days: i64) -> (i64, i64, i64) {
    let shifted = days + 719_468;
    let era = shifted.div_euclid(146_097);
    let day_of_era = shifted.rem_euclid(146_097);
    let year_of_era =
        (day_of_era - day_of_era / 1460 + day_of_era / 36_524 - day_of_era / 146_096) / 365;
    let day_of_year = day_of_era - (365 * year_of_era + year_of_era / 4 - year_of_era / 100);
    let month_index = (5 * day_of_year + 2) / 153;
    let day = day_of_year - (153 * month_index + 2) / 5 + 1;
    let month = if month_index < 10 { month_index + 3 } else { month_index - 9 };
    let year = year_of_era + era * 400 + i64::from(month <= 2);
    (year, month, day)
}
