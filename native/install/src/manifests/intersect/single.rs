//! `SingleVer` / `SingleRange` of `semver-range-intersect`.

use super::{
    super::semver::{Comparator, SemVer},
    bounds::{End, bound, is_equals, same_version_equals_like, strip_operator},
    ranges_intersect,
};
use std::{cmp::Ordering, fmt, io};

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) enum Single {
    /// One exact version.
    Ver(Comparator),
    /// A lower and an upper bound (either may be `*`).
    Range(Comparator, Comparator),
}

impl fmt::Display for Single {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Single::Ver(comparator) => formatter.write_str(comparator.value.trim()),
            Single::Range(lower, upper) => {
                let parts: Vec<&str> = [lower.value.trim(), upper.value.trim()]
                    .into_iter()
                    .filter(|value| !value.is_empty())
                    .collect();
                formatter.write_str(&parts.join(" "))
            }
        }
    }
}

/// `new SingleRange(lower, upper)`, which throws when the bounds do not intersect.
fn new_range(lower: Comparator, upper: Comparator) -> io::Result<Single> {
    if !lower.intersects(&upper)? {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            format!(
                "Invalid range; version range does not intersect: {} {}",
                lower.value, upper.value,
            ),
        ));
    }
    Ok(Single::Range(lower, upper))
}

fn bounds(single: &Single) -> Option<(&Comparator, &Comparator)> {
    match single {
        Single::Ver(_) => None,
        Single::Range(lower, upper) => Some((lower, upper)),
    }
}

/// The merged bound of two lower (or two upper) bounds; `None` when a
/// prerelease prevents merging.
fn merge_bound(left: &Comparator, right: &Comparator, end: End) -> Option<Comparator> {
    let (Some(left_semver), Some(right_semver)) = (&left.semver, &right.semver) else {
        return merge_with_any(left, right);
    };
    if merge_blocked(left_semver, right_semver, end) {
        return None;
    }
    let order = left_semver.compare(right_semver);
    if left.operator != right.operator && order == Ordering::Equal {
        let inclusive = if left.operator == end.inclusive() { left } else { right };
        return Some(inclusive.clone());
    }
    let wider = match end {
        End::Lower => order.is_lt(),
        End::Upper => order.is_gt(),
    };
    Some(if wider { left.clone() } else { right.clone() })
}

/// A prerelease bound only merges with a bound of the same `M.m.p` or one it widens.
fn merge_blocked(left: &SemVer, right: &SemVer, end: End) -> bool {
    let main = left.compare_main(right);
    let (right_side, left_side) = match end {
        End::Lower => (main.is_lt(), main.is_gt()),
        End::Upper => (main.is_gt(), main.is_lt()),
    };
    (right_side && is_pre(right)) || (left_side && is_pre(left))
}

fn versioned(items: [&Comparator; 2]) -> impl Iterator<Item = Comparator> + '_ {
    items
        .into_iter()
        .filter(|comp| comp.semver.is_some())
        .cloned()
}

fn is_pre(semver: &SemVer) -> bool {
    !semver.prerelease.is_empty()
}

fn merge_with_any(left: &Comparator, right: &Comparator) -> Option<Comparator> {
    let (any, other) = if left.semver.is_none() { (left, right) } else { (right, left) };
    if other.semver.as_ref().is_some_and(is_pre) {
        return None;
    }
    Some(any.clone())
}

impl Single {
    /// `singleRange.intersect(other)`.
    pub(super) fn intersect(&self, other: &Self) -> io::Result<Option<Self>> {
        if !ranges_intersect(&self.to_string(), &other.to_string())? {
            return Ok(None);
        }
        let (Some((lower_a, upper_a)), Some((lower_b, upper_b))) = (bounds(self), bounds(other))
        else {
            return Ok(Some(if matches!(self, Single::Ver(_)) {
                self.clone()
            } else {
                other.clone()
            }));
        };
        let lowers: Vec<_> = [lower_a.clone(), lower_b.clone()]
            .into_iter()
            .chain(versioned([upper_a, upper_b]))
            .collect();
        let uppers: Vec<_> = [upper_a.clone(), upper_b.clone()]
            .into_iter()
            .chain(versioned([lower_a, lower_b]))
            .collect();
        let lower = bound(&lowers, End::Lower, false)?;
        let upper = bound(&uppers, End::Upper, false)?;
        if same_version_equals_like(&lower, &upper) {
            return Ok(Some(Single::Ver(strip_operator(&lower)?)));
        }
        new_range(lower, upper).map(Some)
    }

    /// `singleRange.merge(other)`.
    pub(super) fn merge(&self, other: &Self) -> io::Result<Option<Self>> {
        if !ranges_intersect(&self.to_string(), &other.to_string())? {
            return Ok(None);
        }
        let (Some((lower_a, upper_a)), Some((lower_b, upper_b))) = (bounds(self), bounds(other))
        else {
            return Ok(Some(if matches!(self, Single::Ver(_)) {
                other.clone()
            } else {
                self.clone()
            }));
        };
        let lower = merge_bound(lower_a, lower_b, End::Lower);
        let upper = merge_bound(upper_a, upper_b, End::Upper);
        match (lower, upper) {
            (Some(lower), Some(upper)) => new_range(lower, upper).map(Some),
            _ => Ok(None),
        }
    }
}

/// `createSingleRange(comparators)`.
pub(super) fn create_single(comparators: &[Comparator]) -> io::Result<Option<Single>> {
    let mut equals: Vec<&Comparator> = Vec::new();
    for comparator in comparators.iter().filter(|comp| is_equals(comp)) {
        if !equals
            .iter()
            .any(|existing| existing.value.trim() == comparator.value.trim())
        {
            equals.push(comparator);
        }
    }
    match equals.as_slice() {
        [] => {
            let lower = bound(comparators, End::Lower, true)?;
            let upper = bound(comparators, End::Upper, true)?;
            if same_version_equals_like(&lower, &upper) {
                return Ok(Some(Single::Ver(strip_operator(&lower)?)));
            }
            Ok(new_range(lower, upper).ok())
        }
        [only] => {
            let stripped = strip_operator(only)?;
            let satisfies = stripped.semver
                .as_ref()
                .is_none_or(|ver| {
                    comparators
                        .iter()
                        .all(|comp| comp.test(ver))
                });
            Ok(satisfies.then_some(Single::Ver(stripped)))
        }
        _ => Ok(None),
    }
}

/// The outcome of folding one single range into the already-normalized list.
struct Fold {
    append: Option<Single>,
    removed: Vec<usize>,
    insert_first: bool,
}

fn fold_into(list: &[Option<Single>], single: Single) -> io::Result<Fold> {
    let mut fold = Fold { append: Some(single), removed: Vec::new(), insert_first: false };
    for (index, inserted) in list.iter().enumerate() {
        let (Some(inserted), Some(append)) = (inserted, &fold.append) else { continue };
        let Some(merged) = inserted.merge(append)? else { continue };
        if merged.to_string() == inserted.to_string() {
            fold.append = None;
            continue;
        }
        fold.removed.push(index);
        fold.insert_first |=
            matches!(inserted, Single::Range(..)) && matches!(append, Single::Range(..));
        fold.append = Some(merged);
    }
    Ok(fold)
}

/// `normalizeSingleRangeList`: merge overlapping single ranges, keeping `null`s.
pub(super) fn normalize(singles: Vec<Option<Single>>) -> io::Result<Vec<Option<Single>>> {
    let mut list: Vec<Option<Single>> = Vec::new();
    for single in singles {
        let Some(single) = single else {
            list.push(None);
            continue;
        };
        let fold = fold_into(&list, single)?;
        let kept = list
            .into_iter()
            .enumerate()
            .filter(|(index, _)| !fold.removed.contains(index))
            .map(|(_, item)| item);
        list = match fold.append {
            Some(append) if fold.insert_first => {
                std::iter::once(Some(append)).chain(kept).collect()
            }
            Some(append) => kept
                .chain(std::iter::once(Some(append)))
                .collect(),
            None => kept.collect(),
        };
    }
    Ok(list)
}
