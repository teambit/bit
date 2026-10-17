//! `Comparator` of npm's `semver`.

use super::{
    Flavor, Range,
    re::{Token, collapse_whitespace, groups, re},
    version::SemVer,
};
use std::{cmp::Ordering, io};

/// One `<op><version>` comparator. `semver` is `None` for `ANY` (an empty comparator).
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct Comparator {
    pub(crate) operator: String,
    pub(crate) semver: Option<SemVer>,
    /// `operator + semver.version`, or `""` for `ANY`.
    pub(crate) value: String,
}

impl Comparator {
    /// `new Comparator(comp)`: throws (`Err`) on an invalid comparator.
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

    pub(crate) fn new(operator: &str, semver: Option<SemVer>) -> Self {
        let value = semver
            .as_ref()
            .map_or_else(String::new, |semver| format!("{operator}{}", semver.format()));
        Comparator { operator: operator.to_string(), semver, value }
    }

    /// `comparator.test(version)`.
    pub(crate) fn test(&self, version: &SemVer) -> bool {
        let Some(semver) = &self.semver else { return true };
        let order = version.compare(semver);
        match self.operator.as_str() {
            ">" => order == Ordering::Greater,
            ">=" => order != Ordering::Less,
            "<" => order == Ordering::Less,
            "<=" => order != Ordering::Greater,
            _ => order == Ordering::Equal,
        }
    }

    fn increasing(&self) -> bool {
        matches!(self.operator.as_str(), ">=" | ">")
    }

    fn decreasing(&self) -> bool {
        matches!(self.operator.as_str(), "<=" | "<")
    }

    fn inclusive(&self) -> bool {
        matches!(self.operator.as_str(), ">=" | "<=")
    }

    /// `comparator.intersects(comp)` of semver 6.
    pub(crate) fn intersects(&self, other: &Self) -> io::Result<bool> {
        if self.operator.is_empty() {
            if self.value.is_empty() {
                return Ok(true);
            }
            return Ok(Range::parse(&other.value, Flavor::V6)?.test_str(&self.value));
        }
        if other.operator.is_empty() {
            if other.value.is_empty() {
                return Ok(true);
            }
            let range = Range::parse(&self.value, Flavor::V6)?;
            return Ok(other.semver
                .as_ref()
                .is_some_and(|semver| range.test(semver)));
        }
        Ok(self.directions_intersect(other))
    }

    fn directions_intersect(&self, other: &Self) -> bool {
        let (Some(this), Some(that)) = (&self.semver, &other.semver) else { return true };
        let same_increasing = self.increasing() && other.increasing();
        let same_decreasing = self.decreasing() && other.decreasing();
        let same_semver = this.format() == that.format();
        let inclusive = self.inclusive() && other.inclusive();
        let order = this.compare(that);
        let less = order == Ordering::Less && self.increasing() && other.decreasing();
        let greater = order == Ordering::Greater && self.decreasing() && other.increasing();
        same_increasing || same_decreasing || (same_semver && inclusive) || less || greater
    }
}
