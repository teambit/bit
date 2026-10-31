//! `semver-range-intersect` 0.3.1: the intersection of npm ranges as a range
//! string, on semver 6 comparators.

mod bounds;
mod single;
#[cfg(test)]
mod tests;

use super::semver::{Flavor, Range};
use single::{Single, create_single, normalize};
use std::io;

/// A union of single ranges (`MultiRange`); empty is the library's invalid range.
#[derive(Debug, Default, Clone)]
struct Multi(Vec<Single>);

impl Multi {
    fn from_range(range: &Range) -> io::Result<Self> {
        let singles = range.set
            .iter()
            .map(|comps| create_single(comps))
            .collect::<io::Result<Vec<_>>>()?;
        Ok(Multi(
            normalize(singles)?
                .into_iter()
                .flatten()
                .collect(),
        ))
    }

    fn intersect(self, other: Self) -> io::Result<Self> {
        if self.0.is_empty() {
            return Ok(other);
        }
        if other.0.is_empty() {
            return Ok(self);
        }
        let mut singles = Vec::new();
        for a in &self.0 {
            for b in &other.0 {
                if let Some(single) = a.intersect(b)? {
                    singles.push(Some(single));
                }
            }
        }
        Ok(Multi(
            normalize(singles)?
                .into_iter()
                .flatten()
                .collect(),
        ))
    }

    fn format(&self) -> String {
        let mut parts: Vec<String> = Vec::new();
        for single in &self.0 {
            let text = single.to_string();
            if !parts.contains(&text) {
                parts.push(text);
            }
        }
        parts.join(" || ")
    }
}

/// `semver.intersects(a, b)` of semver 6 on two range strings.
pub(crate) fn ranges_intersect(left: &str, right: &str) -> io::Result<bool> {
    Range::parse(left, Flavor::V6)?.intersects(&Range::parse(right, Flavor::V6)?)
}

fn all_pairs_intersect(ranges: &[Range]) -> io::Result<bool> {
    for (index, a) in ranges.iter().enumerate() {
        for b in &ranges[index + 1..] {
            if !a.intersects(b)? {
                return Ok(false);
            }
        }
    }
    Ok(true)
}

/// `intersect(...ranges)`: the intersected range, or `None` when the ranges do
/// not intersect or one of them is not a valid range.
pub(crate) fn intersect(ranges: &[&str]) -> io::Result<Option<String>> {
    if ranges.is_empty() {
        return Ok(None);
    }
    let Ok(parsed) = ranges
        .iter()
        .map(|range| Range::parse(range, Flavor::V6))
        .collect::<io::Result<Vec<_>>>()
    else {
        return Ok(None);
    };
    if !all_pairs_intersect(&parsed)? {
        return Ok(None);
    }
    let mut result = Multi::default();
    for range in &parsed {
        result = result.intersect(Multi::from_range(range)?)?;
    }
    if result.0.is_empty() {
        return Ok(None);
    }
    let text = result.format();
    Ok(Some(if text.is_empty() { "*".to_string() } else { text }))
}
