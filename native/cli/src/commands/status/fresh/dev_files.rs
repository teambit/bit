//! Whether a component file is a test, docs or composition file under the
//! default dev patterns, as `matchPatterns` decides with `minimatch` 3.0.5.
//!
//! `minimatch(file, '**/<name>')` lets `**` match any number of directories
//! that do not start with a dot, and matches the file name with the segment
//! regex below (`dot: false`, case-sensitive).

use regress::Regex;
use std::sync::OnceLock;

/// The segment regexes `minimatch` compiles for `defaultTestPatterns()`,
/// `defaultDocsPatterns()` and `defaultCompositionsPatterns()`.
const NAMES: [&str; 4] = [
    r"^(?!\.)(?=.)[^/]*?\.spec\.(?:js|ts|jsx|tsx)+$",
    r"^(?!\.)(?=.)[^/]*?\.test\.(?:js|ts|jsx|tsx)+$",
    r"^(?!\.)(?=.)[^/]*?\.docs\.[^/]*?$",
    r"^(?!\.)(?=.)[^/]*?\.composition(?:s)?\.[^/]*?$",
];

fn names() -> &'static [Regex] {
    static NAMES_RE: OnceLock<Vec<Regex>> = OnceLock::new();
    NAMES_RE.get_or_init(|| {
        NAMES
            .iter()
            .map(|source| Regex::new(source).expect("dev pattern regexes compile"))
            .collect()
    })
}

/// The default dev pattern groups, in `NAMES` order.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Group {
    /// `defaultTestPatterns()`: `*.spec.*` and `*.test.*`.
    Tests,
    /// `defaultDocsPatterns()`.
    Docs,
    /// `defaultCompositionsPatterns()`.
    Compositions,
}

impl Group {
    fn names(self) -> &'static [Regex] {
        let all = names();
        match self {
            Self::Tests => &all[0..2],
            Self::Docs => &all[2..3],
            Self::Compositions => &all[3..4],
        }
    }
}

/// `files.filter(file => matchPatterns(file, group))`.
pub fn group_files(files: &[String], group: Group) -> Vec<String> {
    files
        .iter()
        .filter(|file| matches(file, group.names()))
        .cloned()
        .collect()
}

/// `file` is a relative path with `/` separators.
pub fn is_dev_file(file: &str) -> bool {
    matches(file, names())
}

fn matches(file: &str, regexes: &[Regex]) -> bool {
    let normalized = if cfg!(windows) { file.replace('\\', "/") } else { file.to_string() };
    let mut segments: Vec<&str> = normalized.split('/').collect();
    // `matchOne` accepts one trailing empty segment once the pattern is consumed.
    if segments.len() > 1 && segments.last() == Some(&"") {
        segments.pop();
    }
    let name = segments.pop().unwrap_or_default();
    if segments
        .iter()
        .any(|dir| matches!(*dir, "." | "..") || dir.starts_with('.'))
    {
        return false;
    }
    regexes
        .iter()
        .any(|regex| regex.find(name).is_some())
}
