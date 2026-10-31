//! `hoistDependencies`: per package, pick the root version and keep the
//! conflicting requirements in their components.

use super::{Deduped, IndexEntry, Item};
use crate::manifests::{
    deps::Field,
    intersect::intersect,
    semver::{gt, valid_range},
    versions::is_range,
};
use std::io;

/// Add the items `hoisted` rejects to their components (`addToComponentDependenciesMapInDeduped`).
fn keep_in_components(
    deduped: &mut Deduped,
    name: &str,
    items: &[Item],
    mut hoisted: impl FnMut(&Item) -> bool,
) {
    for item in items
        .iter()
        .filter(|item| !hoisted(item))
    {
        let entry = deduped.components.entry(item.origin.clone()).or_default();
        entry.get_mut(item.field).insert(name.to_string(), item.range.clone());
    }
}

fn set_root(deduped: &mut Deduped, field: Field, name: &str, version: &str) {
    deduped.root.get_mut(field).insert(name.to_string(), version.to_string());
}

/// `handlePreserved`: the workspace policy version goes to the root.
fn handle_preserved(deduped: &mut Deduped, name: &str, entry: &IndexEntry) -> io::Result<bool> {
    let Some((version, field)) = &entry.preserved else { return Ok(true) };
    let version = version.trim();
    set_root(deduped, *field, name, version);
    let mut intersecting = Vec::new();
    for item in &entry.items {
        intersecting.push(intersect(&[item.range.trim(), version])?.is_some());
    }
    let mut kept = intersecting.into_iter();
    keep_in_components(deduped, name, &entry.items, |_| kept.next().unwrap_or(false));
    Ok(false)
}

/// `addOneOccurrenceToRoot`: one requirement, or all requirements equal.
fn add_one_occurrence_to_root(deduped: &mut Deduped, name: &str, items: &[Item]) -> bool {
    let Some(first) = items.first() else {
        return false;
    };
    if items.len() > 1
        && items
            .iter()
            .any(|item| item.range != first.range)
    {
        return true;
    }
    set_root(deduped, first.field, name, &first.range);
    false
}

/// `handlePeersOnly`: peers stay with their components; conflicts are reported.
fn handle_peers_only(deduped: &mut Deduped, name: &str, items: &[Item]) -> io::Result<bool> {
    if items
        .iter()
        .any(|item| item.field != Field::PeerDependencies)
    {
        return Ok(true);
    }
    let ranges: Vec<&str> = items
        .iter()
        .map(|item| item.range.as_str())
        .collect();
    let intersected = intersect(&ranges)?;
    keep_in_components(deduped, name, items, |_| false);
    if intersected.is_none() {
        let origins: Vec<&str> = items
            .iter()
            .map(|item| item.origin.as_str())
            .collect();
        deduped.peer_conflicts.push(format!(
            "The following components has conflicted peer dependencies: {} for the dependency: {name}",
            origins.join(","),
        ));
    }
    Ok(false)
}

/// `getLifecycleType`: runtime when any component needs it at runtime, else dev.
fn lifecycle_field(items: &[Item]) -> Field {
    if items
        .iter()
        .any(|item| item.field == Field::Dependencies)
    {
        Field::Dependencies
    } else {
        Field::DevDependencies
    }
}

/// Distinct values in first-appearance order with their counts (`countBy`).
fn counts<'a>(values: impl Iterator<Item = &'a str>) -> Vec<(&'a str, usize)> {
    let mut counted: Vec<(&str, usize)> = Vec::new();
    for value in values {
        match counted
            .iter_mut()
            .find(|(existing, _)| *existing == value)
        {
            Some((_, count)) => *count += 1,
            None => counted.push((value, 1)),
        }
    }
    counted
}

/// `findMostCommonVersion`: ties go to the higher version.
fn most_common_version<'a>(versions: impl Iterator<Item = &'a str>) -> io::Result<(String, usize)> {
    let mut best = ("0.0.0".to_string(), 0);
    for (version, count) in counts(
        versions
            .map(str::trim)
            .filter(|ver| !ver.is_empty()),
    ) {
        if count > best.1 || (count == best.1 && gt(version, &best.0)?) {
            best = (version.to_string(), count);
        }
    }
    Ok(best)
}

/// `arrayCombinations`: by size, then the whole array last.
fn combinations<'a>(values: &[&'a str]) -> Vec<Vec<&'a str>> {
    fn collect<'a>(size: usize, rest: &[&'a str], chosen: &[&'a str], all: &mut Vec<Vec<&'a str>>) {
        if size == 0 {
            if !chosen.is_empty() {
                all.push(chosen.to_vec());
            }
            return;
        }
        for (index, value) in rest.iter().enumerate() {
            let mut next = chosen.to_vec();
            next.push(value);
            collect(size - 1, &rest[index + 1..], &next, all);
        }
    }
    let mut all = Vec::new();
    for size in 0..values.len() {
        collect(size, values, &[], &mut all);
    }
    all.push(values.to_vec());
    all
}

/// The chosen combination of ranges ([`BestRange`]).
struct BestRange<'a> {
    ranges: Vec<&'a str>,
    intersected: String,
    count: usize,
}

/// `findBestRange`: the combination covering the most requirements that still intersects.
fn best_range<'a>(ranges: &[&'a str]) -> io::Result<BestRange<'a>> {
    let counted = counts(ranges.iter().copied());
    let unique: Vec<&str> = counted
        .iter()
        .map(|(range, _)| *range)
        .collect();
    let total = |combination: &[&str]| -> usize {
        combination
            .iter()
            .map(|range| {
                counted
                    .iter()
                    .find(|(value, _)| value == range)
                    .map_or(0, |(_, count)| *count)
            })
            .sum()
    };
    // `sortBy(total).reverse()`: descending, and among equal totals the later one first.
    let mut sorted: Vec<(Vec<&str>, usize)> = combinations(&unique)
        .into_iter()
        .map(|combination| {
            let sum = total(&combination);
            (combination, sum)
        })
        .collect();
    sorted.sort_by_key(|(_, sum)| *sum);
    sorted.reverse();
    for (combination, sum) in sorted {
        if let Some(intersected) = intersect(&combination)? {
            return Ok(BestRange { ranges: combination, intersected, count: sum });
        }
    }
    Ok(BestRange { ranges: Vec::new(), intersected: "0.0.0".to_string(), count: 0 })
}

fn handle_exact_versions_only(deduped: &mut Deduped, name: &str, items: &[Item]) -> io::Result<()> {
    let (version, _) = most_common_version(items.iter().map(|item| item.range.as_str()))?;
    set_root(deduped, lifecycle_field(items), name, &version);
    keep_in_components(deduped, name, items, |item| item.range == version);
    Ok(())
}

fn handle_ranges_only(deduped: &mut Deduped, name: &str, items: &[Item]) -> io::Result<()> {
    let ranges: Vec<&str> = items
        .iter()
        .map(|item| item.range.as_str())
        .collect();
    let best = best_range(&ranges)?;
    set_root(deduped, lifecycle_field(items), name, &best.intersected);
    keep_in_components(deduped, name, items, |item| best.ranges.contains(&item.range.as_str()));
    Ok(())
}

/// `handleRangesAndVersions`: compare valid semver ranges against exact versions.
fn handle_ranges_and_versions(
    deduped: &mut Deduped,
    name: &str,
    items: &[Item],
    versions: &[&Item],
) -> io::Result<()> {
    let (version, count) = most_common_version(versions.iter().map(|item| item.range.as_str()))?;
    let ranges: Vec<&str> = items
        .iter()
        .map(|item| item.range.as_str())
        .filter(|range| valid_range(range).is_some())
        .collect();
    let best = best_range(&ranges)?;
    let field = lifecycle_field(items);
    if best.count < count {
        set_root(deduped, field, name, &version);
        keep_in_components(deduped, name, items, |item| item.range == version);
    } else {
        set_root(deduped, field, name, &best.intersected);
        keep_in_components(deduped, name, items, |item| best.ranges.contains(&item.range.as_str()));
    }
    Ok(())
}

fn hoist_one(
    deduped: &mut Deduped,
    name: &str,
    entry: &IndexEntry,
    dedupe_peers: bool,
) -> io::Result<()> {
    if !handle_preserved(deduped, name, entry)?
        || !add_one_occurrence_to_root(deduped, name, &entry.items)
    {
        return Ok(());
    }
    if !handle_peers_only(deduped, name, &entry.items)? && !dedupe_peers {
        return Ok(());
    }
    let mut versions = Vec::new();
    let mut has_ranges = false;
    for item in &entry.items {
        if is_range(&item.range, &item.origin)? {
            has_ranges = true;
        } else {
            versions.push(item);
        }
    }
    match (versions.is_empty(), has_ranges) {
        (false, false) => handle_exact_versions_only(deduped, name, &entry.items),
        (true, true) => handle_ranges_only(deduped, name, &entry.items),
        _ => handle_ranges_and_versions(deduped, name, &entry.items, &versions),
    }
}

/// `hoistDependencies(index, { dedupePeerDependencies })`.
pub(super) fn hoist(
    index: &indexmap::IndexMap<String, IndexEntry>,
    dedupe_peers: bool,
) -> io::Result<Deduped> {
    let mut deduped = Deduped::default();
    for (name, entry) in index {
        hoist_one(&mut deduped, name, entry, dedupe_peers)?;
    }
    Ok(deduped)
}
