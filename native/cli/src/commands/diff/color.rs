//! chalk 4.1.2 as the Node.js CLI's process sets it up: whether stdout gets
//! colors (`supports-color` 7.2.0), and how `chalk.red`/`green`/`bold` wrap text.

use std::{
    env,
    ffi::OsString,
    io::{self, IsTerminal},
};

#[derive(Debug, Clone, Copy)]
pub struct Chalk {
    enabled: bool,
}

impl Chalk {
    /// `chalk.supportsColor` for stdout, given the command's arguments.
    pub fn detect(args: &[OsString]) -> Self {
        Self { enabled: level(args, io::stdout().is_terminal()) > 0 }
    }

    #[cfg(test)]
    pub const fn new(enabled: bool) -> Self {
        Self { enabled }
    }

    pub fn red(self, text: &str) -> String {
        self.apply("\u{1b}[31m", "\u{1b}[39m", text)
    }

    pub fn green(self, text: &str) -> String {
        self.apply("\u{1b}[32m", "\u{1b}[39m", text)
    }

    pub fn bold(self, text: &str) -> String {
        self.apply("\u{1b}[1m", "\u{1b}[22m", text)
    }

    /// `applyStyle`: reopen after any existing close code, close and reopen
    /// around every line break.
    fn apply(self, open: &str, close: &str, text: &str) -> String {
        if !self.enabled || text.is_empty() {
            return text.to_string();
        }
        let mut text = text.to_string();
        if text.contains('\u{1b}') {
            text = text.replace(close, &format!("{close}{open}"));
        }
        if text.contains('\n') {
            text = encase_line_breaks(&text, close, open);
        }
        format!("{open}{text}{close}")
    }
}

/// `stringEncaseCRLFWithFirstIndex`.
fn encase_line_breaks(text: &str, close: &str, open: &str) -> String {
    let mut output = String::with_capacity(text.len());
    let mut lines = text.split('\n').peekable();
    while let Some(line) = lines.next() {
        if lines.peek().is_none() {
            output.push_str(line);
            break;
        }
        let (line, ending) = line
            .strip_suffix('\r')
            .map_or((line, "\n"), |line| (line, "\r\n"));
        for part in [line, close, ending, open] {
            output.push_str(part);
        }
    }
    output
}

/// `has-flag`: `--<flag>` among the arguments, before any `--`.
fn has_flag(args: &[OsString], flag: &str) -> bool {
    let wanted = format!("--{flag}");
    let position = args
        .iter()
        .position(|arg| *arg == *wanted);
    let terminator = args.iter().position(|arg| arg == "--");
    position.is_some_and(|position| terminator.is_none_or(|terminator| position < terminator))
}

/// The forced level from flags and `FORCE_COLOR`.
fn forced(args: &[OsString]) -> Option<u32> {
    let mut forced = None;
    if ["no-color", "no-colors", "color=false", "color=never"].iter().any(|f| has_flag(args, f)) {
        forced = Some(0);
    } else if ["color", "colors", "color=true", "color=always"].iter().any(|f| has_flag(args, f)) {
        forced = Some(1);
    }
    if let Some(value) = env::var_os("FORCE_COLOR") {
        let value = value.to_string_lossy();
        forced = Some(match value.as_ref() {
            "true" => 1,
            "false" => 0,
            "" => 1,
            text => parse_int(text).map_or(0, |level| level.min(3)),
        });
    }
    forced
}

/// `parseInt(text, 10)` for a level: leading digits, `NaN` (here `None`) otherwise.
fn parse_int(text: &str) -> Option<u32> {
    let trimmed = text.trim_start();
    let digits: String = trimmed
        .chars()
        .take_while(char::is_ascii_digit)
        .collect();
    if digits.is_empty() {
        return None;
    }
    Some(digits.parse().unwrap_or(u32::MAX))
}

/// `supportsColor(true, isTTY)`: 0 means no colors.
fn level(args: &[OsString], tty: bool) -> u32 {
    let forced = forced(args);
    if forced == Some(0) {
        return 0;
    }
    if ["color=16m", "color=full", "color=truecolor", "color=256"].iter().any(|f| has_flag(args, f))
    {
        return 2;
    }
    if !tty && forced.is_none() {
        return 0;
    }
    terminal_level(forced.unwrap_or(0))
}

/// The terminal heuristics, past the stream checks.
fn terminal_level(min: u32) -> u32 {
    let term = var("TERM").unwrap_or_default();
    if term == "dumb" {
        return min;
    }
    if cfg!(windows) {
        return 1;
    }
    if let Some(level) = ci_level(min) {
        return level;
    }
    let apple = matches!(var("TERM_PROGRAM").as_deref(), Some("iTerm.app" | "Apple_Terminal"));
    if var("COLORTERM").as_deref() == Some("truecolor") || apple || basic_term(&term) {
        return 1;
    }
    if var("COLORTERM").is_some() { 1 } else { min }
}

fn var(name: &str) -> Option<String> {
    env::var(name).ok()
}

/// The `CI` and `TEAMCITY_VERSION` checks, when they apply.
fn ci_level(min: u32) -> Option<u32> {
    if var("CI").is_some() {
        let known = ["TRAVIS", "CIRCLECI", "APPVEYOR", "GITLAB_CI", "GITHUB_ACTIONS", "BUILDKITE"];
        let named = known
            .iter()
            .any(|name| var(name).is_some())
            || var("CI_NAME").as_deref() == Some("codeship");
        return Some(if named { 1 } else { min });
    }
    var("TEAMCITY_VERSION").map(|version| u32::from(teamcity_supports_color(&version)))
}

/// `/-256(color)?$/i` and `/^screen|^xterm|^vt100|^vt220|^rxvt|color|ansi|cygwin|linux/i`.
fn basic_term(term: &str) -> bool {
    let lower = term.to_ascii_lowercase();
    lower.ends_with("-256")
        || lower.ends_with("-256color")
        || ["screen", "xterm", "vt100", "vt220", "rxvt"]
            .iter()
            .any(|prefix| lower.starts_with(prefix))
        || ["color", "ansi", "cygwin", "linux"]
            .iter()
            .any(|part| lower.contains(part))
}

/// `/^(9\.(0*[1-9]\d*)\.|\d{2,}\.)/`.
fn teamcity_supports_color(version: &str) -> bool {
    let digits = version
        .chars()
        .take_while(char::is_ascii_digit)
        .count();
    if digits >= 2 {
        return version[digits..].starts_with('.');
    }
    let Some(rest) = version.strip_prefix("9.") else { return false };
    let minor: String = rest
        .chars()
        .take_while(char::is_ascii_digit)
        .collect();
    rest[minor.len()..].starts_with('.')
        && minor
            .trim_start_matches('0')
            .chars()
            .next()
            .is_some_and(|character| character != '0')
}

#[cfg(test)]
mod color_tests;
