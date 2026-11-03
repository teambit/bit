//! chalk 4.1.2 ([`Chalk`]) as the Node.js CLI's process sets it up: whether stdout gets
//! colors (`supports-color` 7.2.0), and how `chalk.red`/`green`/`bold` wrap text.
//!
//! Detects terminal and flag-based color support and provides ANSI [`Style`] wrappers.

#[cfg(test)]
mod color_tests;

use std::{
    env,
    ffi::OsString,
    io::{self, IsTerminal},
};

/// An `ansi-styles` pair: open and close codes.
#[derive(Debug, Clone, Copy)]
struct Style(&'static str, &'static str);

/// ANSI red foreground [`Style`] (`\x1b[31m` / `\x1b[39m`).
const RED: Style = Style("\u{1b}[31m", "\u{1b}[39m");
/// ANSI green foreground [`Style`] (`\x1b[32m` / `\x1b[39m`).
const GREEN: Style = Style("\u{1b}[32m", "\u{1b}[39m");
/// ANSI yellow foreground [`Style`] (`\x1b[33m` / `\x1b[39m`).
const YELLOW: Style = Style("\u{1b}[33m", "\u{1b}[39m");
/// ANSI cyan foreground [`Style`] (`\x1b[36m` / `\x1b[39m`).
const CYAN: Style = Style("\u{1b}[36m", "\u{1b}[39m");
/// ANSI white foreground [`Style`] (`\x1b[37m` / `\x1b[39m`).
const WHITE: Style = Style("\u{1b}[37m", "\u{1b}[39m");
/// ANSI bright black / gray foreground [`Style`] (`\x1b[90m` / `\x1b[39m`).
const GRAY: Style = Style("\u{1b}[90m", "\u{1b}[39m");
/// ANSI underline attribute [`Style`] (`\x1b[4m` / `\x1b[24m`).
const UNDERLINE: Style = Style("\u{1b}[4m", "\u{1b}[24m");
/// ANSI bold intensity [`Style`] (`\x1b[1m` / `\x1b[22m`).
const BOLD: Style = Style("\u{1b}[1m", "\u{1b}[22m");
/// ANSI dim intensity [`Style`] (`\x1b[2m` / `\x1b[22m`).
const DIM: Style = Style("\u{1b}[2m", "\u{1b}[22m");

/// ANSI color wrapper matching `chalk` 4.1.2 behavior in the `Node.js` CLI via [`Style`] pairs.
#[derive(Debug, Clone, Copy)]
pub struct Chalk {
    enabled: bool,
}

impl Chalk {
    /// `chalk.supportsColor` for stdout, given the command's arguments.
    #[inline]
    pub fn detect(args: &[OsString]) -> Self {
        Self { enabled: level(args, io::stdout().is_terminal()) > 0 }
    }

    #[cfg(test)]
    #[inline]
    pub const fn new(enabled: bool) -> Self {
        Self { enabled }
    }

    /// Returns `true` when ANSI color output is active for this [`Chalk`] instance.
    #[inline]
    pub const fn enabled(self) -> bool {
        self.enabled
    }

    /// Wraps `text` in ANSI red when colors are enabled.
    #[inline]
    pub fn red(self, text: &str) -> String {
        self.apply(&[RED], text)
    }

    /// Wraps `text` in ANSI green when colors are enabled.
    #[inline]
    pub fn green(self, text: &str) -> String {
        self.apply(&[GREEN], text)
    }

    /// Wraps `text` in ANSI yellow when colors are enabled.
    #[inline]
    pub fn yellow(self, text: &str) -> String {
        self.apply(&[YELLOW], text)
    }

    #[inline]
    pub fn cyan(self, text: &str) -> String {
        self.apply(&[CYAN], text)
    }

    #[inline]
    pub fn white(self, text: &str) -> String {
        self.apply(&[WHITE], text)
    }

    #[inline]
    pub fn gray(self, text: &str) -> String {
        self.apply(&[GRAY], text)
    }

    #[inline]
    pub fn dim(self, text: &str) -> String {
        self.apply(&[DIM], text)
    }

    #[inline]
    pub fn bold(self, text: &str) -> String {
        self.apply(&[BOLD], text)
    }

    #[inline]
    pub fn underline(self, text: &str) -> String {
        self.apply(&[UNDERLINE], text)
    }

    /// `chalk.bold.white`.
    #[inline]
    pub fn bold_white(self, text: &str) -> String {
        self.apply(&[BOLD, WHITE], text)
    }

    /// `chalk.yellow.bold`.
    #[inline]
    pub fn yellow_bold(self, text: &str) -> String {
        self.apply(&[YELLOW, BOLD], text)
    }

    /// `applyStyle` for a chain of styles, outermost first: reopen each style
    /// after its existing close codes (innermost first), close and reopen
    /// around every line break.
    fn apply(self, styles: &[Style], text: &str) -> String {
        if !self.enabled || text.is_empty() || styles.is_empty() {
            return text.to_string();
        }
        let open: String = styles
            .iter()
            .map(|style| style.0)
            .collect();
        let close: String = styles
            .iter()
            .rev()
            .map(|style| style.1)
            .collect();
        let mut text = text.to_string();
        if text.contains('\u{1b}') {
            for style in styles.iter().rev() {
                text = text.replace(style.1, &format!("{}{}", style.1, style.0));
            }
        }
        if text.contains('\n') {
            text = encase_line_breaks(&text, &close, &open);
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
    args.get(1..)
        .unwrap_or(&[])
        .iter()
        .take_while(|arg| *arg != "--")
        .any(|arg| {
            arg.to_str()
                .and_then(|s| s.strip_prefix("--"))
                == Some(flag)
        })
}

/// The forced level from flags and `FORCE_COLOR`.
fn forced(args: &[OsString]) -> Option<u32> {
    let mut forced = None;
    if ["no-color", "no-color=true", "no-colors", "color=false", "color=never"]
        .iter()
        .any(|flag| has_flag(args, flag))
    {
        forced = Some(0);
    } else if ["color", "colors", "color=true", "color=always", "no-color=false"]
        .iter()
        .any(|flag| has_flag(args, flag))
    {
        forced = Some(1);
    }
    if let Some(value) = env::var_os("FORCE_COLOR") {
        let value = value.to_string_lossy();
        forced = Some(match value.trim() {
            "true" => 1,
            "false" => 0,
            "" => 1,
            text => parse_int(text).map_or(0, |level| level.min(3)),
        });
    }
    forced
}

/// `parseInt(text, 10)` for a level: leading digits, `NaN` (here `None`) otherwise.
#[inline]
fn parse_int(text: &str) -> Option<u32> {
    let trimmed = text.trim_start();
    let digit_len = trimmed
        .bytes()
        .take_while(u8::is_ascii_digit)
        .count();
    if digit_len == 0 {
        return None;
    }
    Some(trimmed[..digit_len].parse().unwrap_or(u32::MAX))
}

/// `supportsColor(true, isTTY)`: 0 means no colors.
fn level(args: &[OsString], tty: bool) -> u32 {
    let forced = forced(args);
    if forced == Some(0) {
        return 0;
    }
    if ["color=16m", "color=full", "color=truecolor", "color=256"]
        .iter()
        .any(|flag| has_flag(args, flag))
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

#[inline]
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
    let version = version.trim();
    let digits = version
        .bytes()
        .take_while(u8::is_ascii_digit)
        .count();
    if digits >= 2 {
        return version[digits..].starts_with('.');
    }
    let Some(rest) = version.strip_prefix("9.") else { return false };
    let minor_len = rest
        .bytes()
        .take_while(u8::is_ascii_digit)
        .count();
    let minor = &rest[..minor_len];
    rest[minor_len..].starts_with('.')
        && minor
            .trim_start_matches('0')
            .bytes()
            .next()
            .is_some_and(|byte| byte != b'0')
}
