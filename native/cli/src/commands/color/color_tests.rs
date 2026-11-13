//! Unit tests for ANSI terminal styling and nested color wrapping in [`Chalk`].
//!
//! Verifies line-by-line escape wrapping and nested style restoration matching `chalk` 4.1.2 level 1 in [`Chalk`].

use super::Chalk;

/// Verifies [`Chalk`] `red(...)` and single-style wrapping with level 1 in `chalk` 4.1.2.
/// Covers empty strings, spaces, LF/CRLF line breaks, and nested bold resets.
#[test]
fn wraps_like_chalk() {
    let chalk = Chalk::new(true);
    assert_eq!(chalk.red(""), "");
    assert_eq!(chalk.red("a"), "\u{1b}[31ma\u{1b}[39m");
    assert_eq!(chalk.gray(" "), "\u{1b}[90m \u{1b}[39m");
    assert_eq!(chalk.red("- a\n"), "\u{1b}[31m- a\u{1b}[39m\n\u{1b}[31m\u{1b}[39m");
    assert_eq!(chalk.green("a\r\nb"), "\u{1b}[32ma\u{1b}[39m\r\n\u{1b}[32mb\u{1b}[39m");
    assert_eq!(chalk.bold("x\u{1b}[22my"), "\u{1b}[1mx\u{1b}[22m\u{1b}[1my\u{1b}[22m");
    assert_eq!(Chalk::new(false).red("a\n"), "a\n");
}

/// Verifies [`Chalk`] `bold.white(...)` and `cyan(...)` around styled text in `chalk` 4.1.2 level 1.
#[test]
fn chains_and_nests_like_chalk() {
    let chalk = Chalk::new(true);
    assert_eq!(chalk.bold_white("t"), "\u{1b}[1m\u{1b}[37mt\u{1b}[39m\u{1b}[22m");
    assert_eq!(
        chalk.bold_white("a\u{1b}[39mb\u{1b}[22mc\nd"),
        "\u{1b}[1m\u{1b}[37ma\u{1b}[39m\u{1b}[37mb\u{1b}[22m\u{1b}[1mc\u{1b}[39m\u{1b}[22m\n\u{1b}[1m\u{1b}[37md\u{1b}[39m\u{1b}[22m",
    );
    assert_eq!(
        chalk.cyan("\u{1b}[32mok\u{1b}[39m x"),
        "\u{1b}[36m\u{1b}[32mok\u{1b}[39m\u{1b}[36m x\u{1b}[39m",
    );
}

/// Verifies that a disabled [`Chalk`] instance returns input strings verbatim without ANSI escapes.
///
/// Checks `yellow`, `cyan`, and `bold_white` helpers when `enabled` is `false`.
#[test]
fn disabled_chalk_returns_inputs_verbatim_across_all_helpers() {
    let chalk = Chalk::new(false);
    assert_eq!(chalk.yellow("warn"), "warn");
    assert_eq!(chalk.cyan("info"), "info");
    assert_eq!(chalk.bold_white("title"), "title");
}
