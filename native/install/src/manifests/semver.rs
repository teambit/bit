//! The parts of npm's `semver` the manifest calculation depends on.
//!
//! Bit runs two majors side by side: `dependency-resolver` uses semver 7
//! (`validRange`, `satisfies`, `coerce`, `gt`), while `semver-range-intersect`
//! (the dedupe's range intersection) runs on semver 6, whose desugared upper
//! bounds lack semver 7's `-0` suffix. Those strings reach the root manifest
//! and the lockfile, so both are reproduced.
//! Provides [`Flavor::V6`] and [`Flavor::V7`] [`Range`] parsing and comparison helpers.

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

/// Major `semver` flavor (`V6` vs. `V7`) controlling desugared exclusive upper-bound suffixes for [`Range`] and [`Comparator`].
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub(crate) enum Flavor {
    /// `semver` 6 (`<2.0.0` upper bounds without `-0`).
    V6,
    /// `semver` 7 (`<2.0.0-0` upper bounds with `-0`).
    V7,
}

impl Flavor {
    /// The suffix of a desugared exclusive upper bound (`<2.0.0` vs `<2.0.0-0`).
    #[inline]
    const fn upper_suffix(self) -> &'static str {
        match self {
            Self::V6 => "",
            Self::V7 => "-0",
        }
    }
}

/// Parse and format `range` using `semver` 7 rules ([`Range::parse`] with [`Flavor::V7`]), returning `None` if invalid.
#[inline]
pub(crate) fn valid_range(range: &str) -> Option<String> {
    let range = Range::parse(range.trim(), Flavor::V7).ok()?;
    let mut formatted = range.format();
    if formatted.is_empty() {
        formatted.push('*');
    }
    Some(formatted)
}

/// `semver.satisfies(version, range)` of `semver` 7 using [`SemVer`] and [`Range`].
#[inline]
pub(crate) fn satisfies(version: &str, range: &str) -> bool {
    SemVer::parse(version.trim())
        .is_ok_and(|semver| {
            Range::parse(range.trim(), Flavor::V7).is_ok_and(|parsed| parsed.test(&semver))
        })
}

/// `semver.satisfies(version, range, { includePrerelease: true })` of `semver` 7 using [`SemVer`] and [`Range`].
#[inline]
pub(crate) fn satisfies_including_prerelease(version: &str, range: &str) -> bool {
    SemVer::parse(version.trim())
        .is_ok_and(|semver| {
            Range::parse(range.trim(), Flavor::V7)
                .is_ok_and(|parsed| parsed.test_including_prerelease(&semver))
        })
}
