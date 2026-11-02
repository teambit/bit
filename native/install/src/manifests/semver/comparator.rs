//! [`Comparator`] of npm's `semver`.
//!
//! Parses `<op><version>` comparators and evaluates [`SemVer`] satisfaction and comparator intersections.

use super::{
    Flavor, Range,
    re::{Token, collapse_whitespace, groups, re},
    version::SemVer,
};
use std::{cmp::Ordering, io};

/// One `<op><version>` comparator. `semver` is `None` for `ANY` (an empty comparator).
#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub(crate) struct Comparator {
    pub(crate) operator: String,
    pub(crate) semver: Option<SemVer>,
    /// `operator + semver.version`, or `""` for `ANY`.
    pub(crate) value: String,
}

impl Comparator {
    /// Parse a single `<op><version>` comparator string (`new Comparator(comp)`).
    pub(crate) fn parse(comp: &str) -> io::Result<Self> {
        let comp = collapse_whitespace(comp);
        let found = re(Token::Comparator)
            .find(&comp)
            .ok_or_else(|| {
                io::Error::new(io::ErrorKind::InvalidInput, format!("Invalid comparator: {comp}"))
            })?;
        let parts = groups(&found, &comp);
        let operator = match parts[1].unwrap_or_default() {
            "=" => "",
            operator => operator,
        };
        let semver = match parts[2] {
            Some(version) if !version.is_empty() => Some(SemVer::parse(version)?),
            _ => None,
        };
        Ok(Self::new(operator, semver))
    }

    /// Construct a [`Comparator`] from `operator` and an optional [`SemVer`].
    #[inline]
    pub(crate) fn new(operator: &str, semver: Option<SemVer>) -> Self {
        let operator = if semver.is_some() { operator.trim() } else { "" };
        let value = semver
            .as_ref()
            .map_or_else(String::new, |semver| {
                if operator.is_empty() {
                    semver.format()
                } else {
                    format!("{operator}{}", semver.format())
                }
            });
        Comparator { operator: operator.to_string(), semver, value }
    }

    /// `comparator.test(version)`.
    #[inline]
    pub(crate) fn test(&self, version: &SemVer) -> bool {
        let Some(semver) = &self.semver else { return true };
        let order = version.compare(semver);
        match self.operator.trim() {
            ">" => order == Ordering::Greater,
            ">=" => order != Ordering::Less,
            "<" => order == Ordering::Less,
            "<=" => order != Ordering::Greater,
            _ => order == Ordering::Equal,
        }
    }

    /// Return `true` when `self.operator` is a lower-bound operator (`">="` or `">"`).
    #[inline]
    fn increasing(&self) -> bool {
        matches!(self.operator.trim(), ">=" | ">")
    }

    #[inline]
    fn decreasing(&self) -> bool {
        matches!(self.operator.trim(), "<=" | "<")
    }

    #[inline]
    fn inclusive(&self) -> bool {
        matches!(self.operator.trim(), ">=" | "<=")
    }

    /// `comparator.intersects(comp)` of semver 6.
    pub(crate) fn intersects(&self, other: &Self) -> io::Result<bool> {
        if self.operator.trim().is_empty() {
            if self.value.trim().is_empty() {
                return Ok(true);
            }
            let range = Range::parse(other.value.trim(), Flavor::V6)?;
            return Ok(self.semver
                .as_ref()
                .is_some_and(|semver| range.test(semver)));
        }
        if other.operator.trim().is_empty() {
            if other.value.trim().is_empty() {
                return Ok(true);
            }
            let range = Range::parse(self.value.trim(), Flavor::V6)?;
            return Ok(other.semver
                .as_ref()
                .is_some_and(|semver| range.test(semver)));
        }
        Ok(self.directions_intersect(other))
    }

    #[inline]
    fn directions_intersect(&self, other: &Self) -> bool {
        let (Some(this), Some(that)) = (&self.semver, &other.semver) else { return true };
        let same_increasing = self.increasing() && other.increasing();
        let same_decreasing = self.decreasing() && other.decreasing();
        let same_semver = this == that;
        let inclusive = self.inclusive() && other.inclusive();
        let order = this.compare(that);
        let less = order == Ordering::Less && self.increasing() && other.decreasing();
        let greater = order == Ordering::Greater && self.decreasing() && other.increasing();
        same_increasing || same_decreasing || (same_semver && inclusive) || less || greater
    }
}
