//! [`SemVer`] of npm's `semver` (strict parsing).

use super::re::{Token, groups, re};
use std::{cmp::Ordering, io};

const MAX_LENGTH: usize = 256;
const MAX_SAFE_INTEGER: u64 = 9_007_199_254_740_991;

/// A parsed version. Prerelease identifiers keep their source text; numeric
/// identifiers compare numerically, like JavaScript's `compareIdentifiers`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct SemVer {
    pub(crate) major: u64,
    pub(crate) minor: u64,
    pub(crate) patch: u64,
    pub(crate) prerelease: Vec<String>,
}

impl SemVer {
    /// `new SemVer(version)`: throws (`Err`) on an invalid version.
    pub(crate) fn parse(version: &str) -> io::Result<Self> {
        let trimmed = version.trim();
        if trimmed.len() > MAX_LENGTH {
            return Err(invalid_version(version));
        }
        let found = re(Token::Full).find(trimmed).ok_or_else(|| invalid_version(version))?;
        let parts = groups(&found, trimmed);
        let number = |index: usize| -> io::Result<u64> {
            let text = parts[index].unwrap_or_default();
            text.parse::<u64>()
                .ok()
                .filter(|value| *value <= MAX_SAFE_INTEGER)
                .ok_or_else(|| invalid_version(version))
        };
        Ok(SemVer {
            major: number(1)?,
            minor: number(2)?,
            patch: number(3)?,
            prerelease: parts[4]
                .map(|pre| {
                    pre.split('.')
                        .map(str::to_string)
                        .collect()
                })
                .unwrap_or_default(),
        })
    }

    /// `semver.version`: `M.m.p[-pre]`, without build metadata.
    pub(crate) fn format(&self) -> String {
        let main = format!("{}.{}.{}", self.major, self.minor, self.patch);
        if self.prerelease.is_empty() {
            return main;
        }
        format!("{main}-{}", self.prerelease.join("."))
    }

    pub(crate) fn compare_main(&self, other: &Self) -> Ordering {
        (self.major, self.minor, self.patch).cmp(&(other.major, other.minor, other.patch))
    }

    fn compare_pre(&self, other: &Self) -> Ordering {
        match (self.prerelease.is_empty(), other.prerelease.is_empty()) {
            (false, true) => return Ordering::Less,
            (true, false) => return Ordering::Greater,
            (true, true) => return Ordering::Equal,
            (false, false) => {}
        }
        for (left, right) in self.prerelease.iter().zip(&other.prerelease) {
            let order = compare_identifiers(left, right);
            if order != Ordering::Equal {
                return order;
            }
        }
        self.prerelease
            .len()
            .cmp(&other.prerelease.len())
    }

    /// `semver.compare(a, b)`.
    pub(crate) fn compare(&self, other: &Self) -> Ordering {
        self.compare_main(other)
            .then_with(|| self.compare_pre(other))
    }
}

fn is_numeric(id: &str) -> bool {
    !id.is_empty() && id.bytes().all(|byte| byte.is_ascii_digit())
}

/// `compareIdentifiers`: numeric identifiers sort before alphanumeric ones.
fn compare_identifiers(left: &str, right: &str) -> Ordering {
    match (is_numeric(left), is_numeric(right)) {
        (true, true) => {
            let (left, right) = (left.trim_start_matches('0'), right.trim_start_matches('0'));
            left.len()
                .cmp(&right.len())
                .then_with(|| left.cmp(right))
        }
        (true, false) => Ordering::Less,
        (false, true) => Ordering::Greater,
        (false, false) => left.cmp(right),
    }
}

pub(crate) fn invalid_version(version: &str) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidInput, format!("Invalid Version: {version}"))
}

/// `semver.gt(a, b)`: throws on an invalid version.
pub(crate) fn gt(left: &str, right: &str) -> io::Result<bool> {
    Ok(SemVer::parse(left)?.compare(&SemVer::parse(right)?) == Ordering::Greater)
}

/// `semver.coerce(version)?.version` (semver 7, left-to-right, no prereleases).
pub(crate) fn coerce(version: &str) -> Option<String> {
    let found = re(Token::Coerce).find(version)?;
    let parts = groups(&found, version);
    let major = parts[2]?;
    let minor = parts[3].unwrap_or("0");
    let patch = parts[4].unwrap_or("0");
    SemVer::parse(&format!("{major}.{minor}.{patch}")).ok().map(|semver| semver.format())
}
