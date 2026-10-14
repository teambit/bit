use super::Chalk;

/// `chalk.red(...)` with level 1 in chalk 4.1.2.
#[test]
fn wraps_like_chalk() {
    let chalk = Chalk::new(true);
    assert_eq!(chalk.red(""), "");
    assert_eq!(chalk.red("a"), "\u{1b}[31ma\u{1b}[39m");
    assert_eq!(chalk.red("- a\n"), "\u{1b}[31m- a\u{1b}[39m\n\u{1b}[31m\u{1b}[39m");
    assert_eq!(chalk.green("a\r\nb"), "\u{1b}[32ma\u{1b}[39m\r\n\u{1b}[32mb\u{1b}[39m");
    assert_eq!(chalk.bold("x\u{1b}[22my"), "\u{1b}[1mx\u{1b}[22m\u{1b}[1my\u{1b}[22m");
    assert_eq!(Chalk::new(false).red("a\n"), "a\n");
}
