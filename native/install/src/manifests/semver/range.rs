//! `Range` of npm's `semver`, in its semver 6 and semver 7 forms.

use super::{
    Flavor,
    comparator::Comparator,
    desugar::{parse_comparator, replace_hyphen},
    re::{Token, collapse_whitespace, re, replace_all, split_whitespace},
    version::SemVer,
};
use indexmap::IndexMap;
use std::io;

/// A parsed range: OR-ed sets of AND-ed comparators.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct Range {
    pub(crate) set: Vec<Vec<Comparator>>,
}

const NULL_SET: &str = "<0.0.0-0";

/// The comparator strings of one `||` part (`Range.parseRange`).
fn comparator_strings(range: &str, flavor: Flavor) -> Vec<String> {
    let range = replace_hyphen(range, flavor);
    let range = replace_all(Token::ComparatorTrim, &range, "$1$2$3");
    let range = replace_all(Token::TildeTrim, &range, "$1~");
    let range = replace_all(Token::CaretTrim, &range, "$1^");
    let range = match flavor {
        Flavor::V6 => split_whitespace(&range).join(" "),
        Flavor::V7 => range,
    };
    let joined = range
        .split(' ')
        .map(|comp| parse_comparator(comp, flavor))
        .collect::<Vec<_>>()
        .join(" ");
    let parts = split_whitespace(&joined).into_iter();
    match flavor {
        Flavor::V6 => parts.map(str::to_string).collect(),
        Flavor::V7 => parts.map(|comp| replace_gte0(comp.trim())).collect(),
    }
}

fn replace_gte0(comp: &str) -> String {
    re(Token::Gte0).replace(comp, "")
}

fn parse_part(range: &str, flavor: Flavor) -> io::Result<Vec<Comparator>> {
    let comparators = comparator_strings(range, flavor)
        .iter()
        .map(|comp| Comparator::parse(comp))
        .collect::<io::Result<Vec<_>>>()?;
    if flavor == Flavor::V6 {
        return Ok(comparators);
    }
    let mut by_value = IndexMap::new();
    for comparator in comparators {
        if comparator.value == NULL_SET {
            return Ok(vec![comparator]);
        }
        by_value.insert(comparator.value.clone(), comparator);
    }
    if by_value.len() > 1 {
        by_value.shift_remove("");
    }
    Ok(by_value.into_values().collect())
}

/// semver 7 drops null sets, and collapses to `*` when any set is `*`.
fn simplify_v7(set: Vec<Vec<Comparator>>) -> Vec<Vec<Comparator>> {
    if set.len() <= 1 {
        return set;
    }
    let Some(first) = set.first().cloned() else {
        return set;
    };
    let set: Vec<_> = set
        .into_iter()
        .filter(|comps| {
            comps
                .first()
                .is_none_or(|comp| comp.value != NULL_SET)
        })
        .collect();
    if set.is_empty() {
        return vec![first];
    }
    match set
        .iter()
        .find(|comps| comps.len() == 1 && comps[0].value.is_empty())
    {
        Some(any) if set.len() > 1 => vec![any.clone()],
        _ => set,
    }
}

impl Range {
    /// `new Range(range)`: throws (`Err`) on an invalid range.
    pub(crate) fn parse(range: &str, flavor: Flavor) -> io::Result<Self> {
        let raw = collapse_whitespace(range);
        let mut set = Vec::new();
        for part in raw.split("||") {
            let comparators = parse_part(part.trim(), flavor)?;
            if !comparators.is_empty() {
                set.push(comparators);
            }
        }
        if set.is_empty() {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                format!("Invalid SemVer Range: {raw}"),
            ));
        }
        let set = if flavor == Flavor::V7 { simplify_v7(set) } else { set };
        Ok(Range { set })
    }

    /// `range.range` of semver 7.
    pub(crate) fn format(&self) -> String {
        self.set
            .iter()
            .map(|comps| {
                comps
                    .iter()
                    .map(|comp| comp.value.trim())
                    .collect::<Vec<_>>()
                    .join(" ")
            })
            .collect::<Vec<_>>()
            .join("||")
    }

    /// `range.test(version)`.
    pub(crate) fn test(&self, version: &SemVer) -> bool {
        self.set.iter().any(|comps| test_set(comps, version, false))
    }

    /// `range.test(versionString)`: an invalid version never satisfies.
    pub(crate) fn test_str(&self, version: &str) -> bool {
        SemVer::parse(version.trim()).is_ok_and(|version| self.test(&version))
    }

    /// `range.test(versionString)` with `includePrerelease`: a prerelease
    /// satisfies any comparator set it fits, not only one naming its tuple.
    pub(crate) fn test_str_including_prerelease(&self, version: &str) -> bool {
        SemVer::parse(version.trim())
            .is_ok_and(|version| self.set.iter().any(|comps| test_set(comps, &version, true)))
    }

    /// `range.intersects(other)` of semver 6.
    pub(crate) fn intersects(&self, other: &Self) -> io::Result<bool> {
        for this in &self.set {
            if !is_satisfiable(this)? {
                continue;
            }
            for that in &other.set {
                if is_satisfiable(that)? && all_intersect(this, that)? {
                    return Ok(true);
                }
            }
        }
        Ok(false)
    }
}

fn all_intersect(this: &[Comparator], that: &[Comparator]) -> io::Result<bool> {
    for left in this {
        for right in that {
            if !left.intersects(right)? {
                return Ok(false);
            }
        }
    }
    Ok(true)
}

/// Whether some version satisfies every comparator (`isSatisfiable`).
pub(crate) fn is_satisfiable(comparators: &[Comparator]) -> io::Result<bool> {
    let mut remaining = comparators.to_vec();
    let Some(mut test) = remaining.pop() else { return Ok(true) };
    while !remaining.is_empty() {
        for other in &remaining {
            if !test.intersects(other)? {
                return Ok(false);
            }
        }
        test = remaining.pop().unwrap_or_else(|| test.clone());
    }
    Ok(true)
}

fn test_set(comparators: &[Comparator], version: &SemVer, include_prerelease: bool) -> bool {
    if !comparators
        .iter()
        .all(|comp| comp.test(version))
    {
        return false;
    }
    if version.prerelease.is_empty() || include_prerelease {
        return true;
    }
    comparators
        .iter()
        .filter_map(|comp| comp.semver.as_ref())
        .any(|allowed| !allowed.prerelease.is_empty() && allowed.compare_main(version).is_eq())
}
