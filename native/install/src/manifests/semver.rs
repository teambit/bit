//! The parts of npm's `semver` the manifest calculation depends on.
//!
//! Bit runs two majors side by side: `dependency-resolver` uses semver 7
//! (`validRange`, `satisfies`, `coerce`, `gt`), while `semver-range-intersect`
//! (the dedupe's range intersection) runs on semver 6, whose desugared upper
//! bounds lack semver 7's `-0` suffix. Those strings reach the root manifest
//! and the lockfile, so both are reproduced.

#[cfg(test)]
pub(crate) mod tests;

pub(crate) use comparator::Comparator;
pub(crate) use range::Range;
pub(crate) use version::{SemVer, coerce, gt};

mod comparator;
mod desugar;
mod range;
mod re;
mod version;

/// The `semver` major whose behavior to reproduce.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum Flavor {
    V6,
    V7,
}

impl Flavor {
    /// The suffix of a desugared exclusive upper bound (`<2.0.0` vs `<2.0.0-0`).
    const fn upper_suffix(self) -> &'static str {
        match self {
            Self::V6 => "",
            Self::V7 => "-0",
        }
    }
}

/// `semver.validRange(range)` of semver 7.
pub(crate) fn valid_range(range: &str) -> Option<String> {
    let range = Range::parse(range, Flavor::V7).ok()?;
    let formatted = range.format();
    Some(if formatted.is_empty() { "*".to_string() } else { formatted })
}

/// `semver.satisfies(version, range)` of semver 7.
pub(crate) fn satisfies(version: &str, range: &str) -> bool {
    !version.trim().is_empty()
        && Range::parse(range, Flavor::V7).is_ok_and(|range| range.test_str(version))
}

/// `semver.satisfies(version, range, { includePrerelease: true })` of semver 7.
pub(crate) fn satisfies_including_prerelease(version: &str, range: &str) -> bool {
    !version.trim().is_empty()
        && Range::parse(range, Flavor::V7)
            .is_ok_and(|range| range.test_str_including_prerelease(version))
}
