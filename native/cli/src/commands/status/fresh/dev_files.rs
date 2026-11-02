//! Whether a component file is a test, docs or composition file under the
//! default dev patterns, as `matchPatterns` decides with `minimatch` 3.0.5.
//!
//! `minimatch(file, '**/<name>')` lets `**` match any number of directories
//! that do not start with a dot, and matches the file name with the [`NAMES`] segment
//! [`Regex`] below (`dot: false`, case-sensitive; [`Group`], [`group_files`], [`is_dev_file`]).

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

/// Returns the compiled [`Regex`] slice corresponding to [`NAMES`].
#[inline]
fn names() -> &'static [Regex] {
    static NAMES_RE: OnceLock<Vec<Regex>> = OnceLock::new();
    NAMES_RE.get_or_init(|| {
        NAMES
            .iter()
            .map(|source| Regex::new(source).expect("dev pattern regexes compile"))
            .collect()
    })
}

/// The default dev pattern groups, in [`NAMES`] order.
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
    /// Returns the compiled segment regex slice for this dev-pattern [`Group`].
    #[inline]
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
#[must_use]
#[inline]
pub fn group_files(files: &[String], group: Group) -> Vec<String> {
    files
        .iter()
        .map(String::as_str)
        .map(|file| file.trim().trim_start_matches("./"))
        .filter(|file| matches(file, group.names()))
        .map(str::to_owned)
        .collect()
}

/// Returns `true` when relative `/` path `file` matches any default dev-file pattern in [`names`].
#[must_use]
#[inline]
pub fn is_dev_file(file: &str) -> bool {
    matches(file, names())
}

/// Returns `true` when relative path `file` matches any segment [`Regex`] in `regexes` without dot-prefixed parent segments.
fn matches(file: &str, regexes: &[Regex]) -> bool {
    let file = file.trim().trim_start_matches("./");
    if file.is_empty() {
        return false;
    }
    let normalized = if cfg!(windows) && file.contains('\\') {
        std::borrow::Cow::Owned(file.replace('\\', "/"))
    } else {
        std::borrow::Cow::Borrowed(file)
    };
    let path = normalized.strip_suffix('/').unwrap_or(&normalized);
    let (dirs, name) = match path.rsplit_once('/') {
        Some((dirs, name)) => (Some(dirs), name),
        None => (None, path),
    };
    if dirs.is_some_and(|dirs| {
        dirs.split('/')
            .any(|dir| matches!(dir.trim(), "." | "..") || dir.trim().starts_with('.'))
    }) {
        return false;
    }
    regexes
        .iter()
        .any(|regex| regex.find(name).is_some())
}
