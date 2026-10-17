//! Comparator helpers of `semver-range-intersect` (`utils.js`).

use super::super::semver::{Comparator, SemVer};
use std::{cmp::Ordering, io};

fn version_text(comparator: &Comparator) -> String {
    comparator.semver
        .as_ref()
        .map(SemVer::format)
        .unwrap_or_default()
}

fn is_prerelease(comparator: &Comparator) -> bool {
    comparator.semver
        .as_ref()
        .is_some_and(|semver| !semver.prerelease.is_empty())
}

/// `stripSemVerPrerelease`: `M.m.p` of the comparator's version.
fn strip_prerelease(comparator: &Comparator) -> String {
    comparator.semver
        .as_ref()
        .map(|semver| format!("{}.{}.{}", semver.major, semver.minor, semver.patch))
        .unwrap_or_default()
}

/// `isSameVersionEqualsLikeComparator`.
pub(super) fn same_version_equals_like(left: &Comparator, right: &Comparator) -> bool {
    let (left_version, right_version) = (version_text(left), version_text(right));
    let equals_like = |comparator: &Comparator| {
        comparator.operator.is_empty() || comparator.operator.contains('=')
    };
    !left_version.is_empty()
        && left_version == right_version
        && equals_like(left)
        && equals_like(right)
}

/// `isEqualsComparator`.
pub(super) fn is_equals(comparator: &Comparator) -> bool {
    comparator.semver.is_some() && matches!(comparator.operator.as_str(), "" | "=")
}

/// `stripComparatorOperator`.
pub(super) fn strip_operator(comparator: &Comparator) -> io::Result<Comparator> {
    if comparator.operator.is_empty() {
        return Ok(comparator.clone());
    }
    Comparator::parse(&version_text(comparator))
}

/// Which end of a range a bound limits.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum End {
    Lower,
    Upper,
}

impl End {
    const fn operators(self) -> [&'static str; 2] {
        match self {
            Self::Lower => [">", ">="],
            Self::Upper => ["<", "<="],
        }
    }

    /// `>=` for a lower bound, `<=` for an upper one.
    pub(super) const fn inclusive(self) -> &'static str {
        match self {
            Self::Lower => ">=",
            Self::Upper => "<=",
        }
    }

    /// `>` for a lower bound, `<` for an upper one: the tighter operator.
    const fn exclusive(self) -> &'static str {
        match self {
            Self::Lower => ">",
            Self::Upper => "<",
        }
    }

    /// The comparison result that makes the left bound the tighter one.
    const fn tighter(self) -> Ordering {
        match self {
            Self::Lower => Ordering::Greater,
            Self::Upper => Ordering::Less,
        }
    }
}

/// The opposite-end operator whose versions keep a prerelease bound as is
/// (`<=` versions for a lower bound, `>=` versions for an upper one).
fn opposite_inclusive(end: End) -> &'static str {
    match end {
        End::Lower => "<=",
        End::Upper => ">=",
    }
}

struct Reducer<'a> {
    end: End,
    single_range: bool,
    opposite_versions: &'a [String],
}

impl Reducer<'_> {
    /// One side is `*`: keep the other, widening a prerelease bound to its release.
    fn against_any(&self, bound: &Comparator) -> io::Result<Comparator> {
        let kept_as_is = bound.operator == self.end.inclusive()
            && self.opposite_versions.contains(&version_text(bound));
        if self.single_range || !is_prerelease(bound) || kept_as_is {
            return Ok(bound.clone());
        }
        let operator = match self.end {
            End::Lower => ">=",
            End::Upper => "<",
        };
        Comparator::parse(&format!("{operator}{}", strip_prerelease(bound)))
    }

    fn both_prerelease(
        &self,
        left: &Comparator,
        right: &Comparator,
        main: Ordering,
    ) -> io::Result<Comparator> {
        let pick_left = match self.end {
            End::Lower => main == Ordering::Greater,
            End::Upper => main == Ordering::Less,
        };
        let chosen = if pick_left { left } else { right };
        let operator = match self.end {
            End::Lower => chosen.operator.as_str(),
            End::Upper => "<",
        };
        Comparator::parse(&format!("{operator}{}", strip_prerelease(chosen)))
    }

    /// Both bounds have versions: the tighter one, prereleases widened unless
    /// reducing a single range.
    fn reduce_versions(
        &self,
        (left, left_semver): (&Comparator, &SemVer),
        (right, right_semver): (&Comparator, &SemVer),
    ) -> io::Result<Comparator> {
        let order = left_semver.compare(right_semver);
        if left.operator != right.operator && order == Ordering::Equal {
            let tighter = if left.operator == self.end.exclusive() { left } else { right };
            return Ok(tighter.clone());
        }
        let main = left_semver.compare_main(right_semver);
        let both_pre =
            !left_semver.prerelease.is_empty() && !right_semver.prerelease.is_empty();
        if !self.single_range && main != Ordering::Equal && both_pre {
            return self.both_prerelease(left, right, main);
        }
        Ok(if order == self.end.tighter() { left.clone() } else { right.clone() })
    }

    fn reduce(&self, left: &Comparator, right: &Comparator) -> io::Result<Comparator> {
        match (&left.semver, &right.semver) {
            (None, _) => self.against_any(right),
            (_, None) => self.against_any(left),
            (Some(left_semver), Some(right_semver)) => {
                self.reduce_versions((left, left_semver), (right, right_semver))
            }
        }
    }
}

/// `getLowerBoundComparator` / `getUpperBoundComparator`.
pub(super) fn bound(
    comparators: &[Comparator],
    end: End,
    single_range: bool,
) -> io::Result<Comparator> {
    let operators = end.operators();
    let mut valid = comparators
        .iter()
        .filter(|comp| {
            operators.contains(&comp.operator.as_str()) || comp.semver.is_none()
        });
    let opposite_versions: Vec<String> = comparators
        .iter()
        .filter(|comp| comp.operator == opposite_inclusive(end))
        .map(version_text)
        .collect();
    let Some(first) = valid.next() else { return Comparator::parse("") };
    let reducer = Reducer { end, single_range, opposite_versions: &opposite_versions };
    let mut result = first.clone();
    for next in valid {
        result = reducer.reduce(&result, next)?;
    }
    Ok(result)
}
