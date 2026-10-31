//! Cases of `hoist-dependencies.spec.ts`, plus the dedupe entry points.

use super::{Deduped, IndexEntry, Item, dedupe, exclude_workspace, hoist::hoist, policy_manifest};
use crate::{
    manifests::deps::{DepsObject, Field},
    model::{DependencyMap, Lifecycle, PolicyEntry},
};
use indexmap::IndexMap;

const DEP: &str = "package-dependency";

fn origin(index: usize) -> String {
    format!("dependent-component-{index}")
}

fn items(ranges: &[&str], field: Field) -> Vec<Item> {
    ranges
        .iter()
        .enumerate()
        .map(|(index, range)| Item { range: (*range).to_string(), origin: origin(index), field })
        .collect()
}

fn run(entries: Vec<(&str, IndexEntry)>) -> Deduped {
    let index: IndexMap<String, IndexEntry> = entries
        .into_iter()
        .map(|(name, entry)| (name.to_string(), entry))
        .collect();
    hoist(&index, false).expect("hoist")
}

fn single(ranges: &[&str], field: Field) -> Deduped {
    run(vec![(DEP, IndexEntry { items: items(ranges, field), preserved: None })])
}

fn root(deduped: &Deduped, field: Field) -> Option<&str> {
    deduped.root
        .get(field)
        .get(DEP)
        .map(String::as_str)
}

fn component(deduped: &Deduped, index: usize, field: Field) -> Option<&str> {
    deduped.components
        .get(&origin(index))?
        .get(field)
        .get(DEP)
        .map(String::as_str)
}

#[test]
fn preserved_version_goes_to_root_and_non_intersecting_stay() {
    let entry = IndexEntry {
        items: items(&["4.0.1", "5.0.0"], Field::Dependencies),
        preserved: Some(("^4.0.0".to_string(), Field::Dependencies)),
    };
    let deduped = run(vec![(DEP, entry)]);
    assert_eq!(root(&deduped, Field::Dependencies), Some("^4.0.0"));
    assert!(!deduped.components.contains_key(&origin(0)));
    assert_eq!(component(&deduped, 1, Field::Dependencies), Some("5.0.0"));
}

#[test]
fn single_occurrence_is_hoisted() {
    for range in ["1.0.0", "^1.0.0"] {
        let deduped = single(&[range], Field::Dependencies);
        assert!(deduped.components.is_empty());
        assert_eq!(root(&deduped, Field::Dependencies), Some(range));
    }
    let deduped = single(&["1.0.0"], Field::PeerDependencies);
    assert!(deduped.components.is_empty());
    assert_eq!(root(&deduped, Field::PeerDependencies), Some("1.0.0"));
}

#[test]
fn equal_peers_are_hoisted_without_conflicts() {
    let deduped = single(&["1.0.0", "1.0.0", "1.0.0"], Field::PeerDependencies);
    assert!(deduped.components.is_empty());
    assert_eq!(root(&deduped, Field::PeerDependencies), Some("1.0.0"));
    assert!(deduped.peer_conflicts.is_empty());
}

#[test]
fn conflicting_peers_stay_and_are_reported() {
    let deduped = run(vec![
        (
            "package-dependency-1",
            IndexEntry {
                items: items(&["4.0.0", "5.0.0"], Field::PeerDependencies),
                preserved: None,
            },
        ),
        (
            "package-dependency-2",
            IndexEntry {
                items: items(&["^4.0.0", "^5.0.0"], Field::PeerDependencies),
                preserved: None,
            },
        ),
    ]);
    assert_eq!(deduped.components.len(), 2);
    assert!(
        Field::ALL
            .iter()
            .all(|field| deduped.root.get(*field).is_empty()),
    );
    assert_eq!(
        deduped.peer_conflicts,
        [
            "The following components has conflicted peer dependencies: dependent-component-0,dependent-component-1 for the dependency: package-dependency-1",
            "The following components has conflicted peer dependencies: dependent-component-0,dependent-component-1 for the dependency: package-dependency-2",
        ],
    );
}

#[test]
fn most_common_exact_version_is_hoisted() {
    let deduped =
        single(&["4.0.0", "5.0.0", "4.0.0", "5.0.0", "4.0.1", "4.0.0"], Field::DevDependencies);
    assert_eq!(root(&deduped, Field::DevDependencies), Some("4.0.0"));
    for index in [0, 2, 5] {
        assert!(!deduped.components.contains_key(&origin(index)));
    }
    assert_eq!(component(&deduped, 1, Field::DevDependencies), Some("5.0.0"));
    assert_eq!(component(&deduped, 3, Field::DevDependencies), Some("5.0.0"));
    assert_eq!(component(&deduped, 4, Field::DevDependencies), Some("4.0.1"));
}

#[test]
fn best_range_is_hoisted() {
    let deduped = single(
        &["^4.0.0", "^5.0.0", "^4.0.0", "^5.0.0", "^5.0.1", "^4.0.1", "^4.0.4"],
        Field::DevDependencies,
    );
    assert_eq!(root(&deduped, Field::DevDependencies), Some(">=4.0.4 <5.0.0"));
    for index in [0, 2, 5, 6] {
        assert!(!deduped.components.contains_key(&origin(index)));
    }
    assert_eq!(component(&deduped, 1, Field::DevDependencies), Some("^5.0.0"));
    assert_eq!(component(&deduped, 3, Field::DevDependencies), Some("^5.0.0"));
    assert_eq!(component(&deduped, 4, Field::DevDependencies), Some("^5.0.1"));
}

#[test]
fn version_matching_more_components_than_the_best_range_is_hoisted() {
    let deduped = single(&["^4.0.0", "5.0.0", "5.0.0", "5.0.0", "^4.0.4"], Field::DevDependencies);
    assert_eq!(root(&deduped, Field::DevDependencies), Some("5.0.0"));
    for index in [1, 2, 3] {
        assert!(!deduped.components.contains_key(&origin(index)));
    }
    assert_eq!(component(&deduped, 0, Field::DevDependencies), Some("^4.0.0"));
    assert_eq!(component(&deduped, 4, Field::DevDependencies), Some("^4.0.4"));
}

#[test]
fn best_range_matching_more_components_than_the_most_common_version_is_hoisted() {
    let deduped = single(&["^4.0.0", "^4.0.2", "5.0.0", "5.0.0", "^4.0.4"], Field::DevDependencies);
    assert_eq!(root(&deduped, Field::DevDependencies), Some(">=4.0.4 <5.0.0"));
    for index in [0, 1, 4] {
        assert!(!deduped.components.contains_key(&origin(index)));
    }
    assert_eq!(component(&deduped, 2, Field::DevDependencies), Some("5.0.0"));
    assert_eq!(component(&deduped, 3, Field::DevDependencies), Some("5.0.0"));
}

#[test]
fn range_combined_with_versions_is_hoisted() {
    let ranges = [
        "^4.0.0", "^4.0.2", "5.0.0", "5.0.0", "^4.0.4", "^4.0.5", "5.0.0", "5.0.0", "^6.0.0",
        "^6.0.1", "^6.0.2", "6.0.4", "6.0.4",
    ];
    let deduped = single(&ranges, Field::DevDependencies);
    assert_eq!(root(&deduped, Field::DevDependencies), Some("6.0.4"));
    for index in 8..=12 {
        assert!(!deduped.components.contains_key(&origin(index)));
    }
    let kept = [
        (0, "^4.0.0"),
        (1, "^4.0.2"),
        (2, "5.0.0"),
        (3, "5.0.0"),
        (4, "^4.0.4"),
        (5, "^4.0.5"),
        (6, "5.0.0"),
        (7, "5.0.0"),
    ];
    for (index, range) in kept {
        assert_eq!(component(&deduped, index, Field::DevDependencies), Some(range));
    }
}

/// A semver version always intersects itself, so the best range covers at least
/// the most common version's count and wins ties.
#[test]
fn equal_counts_prefer_the_best_range() {
    let deduped = single(&["5.0.0", "5.0.0", "^4.0.0", "^6.0.0"], Field::Dependencies);
    assert_eq!(root(&deduped, Field::Dependencies), Some("5.0.0"));
    assert!(!deduped.components.contains_key(&origin(0)));
    assert!(!deduped.components.contains_key(&origin(1)));
    assert_eq!(component(&deduped, 2, Field::Dependencies), Some("^4.0.0"));
    assert_eq!(component(&deduped, 3, Field::Dependencies), Some("^6.0.0"));
}

/// Non-semver versions that win are omitted from matching components.
#[test]
fn most_common_version_winning_keeps_only_conflicting_requirements() {
    let deduped = single(&["workspace:*", "workspace:*", "^1.0.0"], Field::Dependencies);
    assert_eq!(root(&deduped, Field::Dependencies), Some("workspace:*"));
    assert!(!deduped.components.contains_key(&origin(0)));
    assert!(!deduped.components.contains_key(&origin(1)));
    assert_eq!(component(&deduped, 2, Field::Dependencies), Some("^1.0.0"));
}

#[test]
fn runtime_requirement_makes_the_root_entry_runtime() {
    let mut requirements = items(&["^1.0.0", "^1.2.0"], Field::DevDependencies);
    requirements[1].field = Field::Dependencies;
    let deduped = run(vec![(DEP, IndexEntry { items: requirements, preserved: None })]);
    assert_eq!(root(&deduped, Field::Dependencies), Some(">=1.2.0 <2.0.0"));
    assert!(deduped.components.is_empty());
}

#[test]
fn invalid_spec_fails_like_the_original() {
    let index: IndexMap<String, IndexEntry> = [(
        DEP.to_string(),
        IndexEntry { items: items(&["^1.0.0", "foo bar"], Field::Dependencies), preserved: None },
    )]
    .into();
    let message = hoist(&index, false).unwrap_err().to_string();
    assert_eq!(
        message,
        r#"fatal: the version "foo bar" originated from a dependent "dependent-component-1" is invalid semver range and not a hash"#,
    );
}

fn policy(name: &str, version: &str, lifecycle: Lifecycle, preserve: Option<bool>) -> PolicyEntry {
    PolicyEntry {
        name: name.to_string(),
        version: version.to_string(),
        lifecycle,
        force: false,
        optional: false,
        hidden: false,
        preserve,
        workspace_singleton: false,
        r#override: false,
        source: None,
        resolve_from_env: false,
    }
}

fn deps(entries: &[(&str, &str)]) -> DepsObject {
    let mut object = DepsObject::default();
    let map: DependencyMap = entries
        .iter()
        .map(|(name, range)| ((*name).to_string(), (*range).to_string()))
        .collect();
    object.set(Field::Dependencies, map);
    object
}

#[test]
fn workspace_policy_is_merged_into_root_and_preserved() {
    let components: IndexMap<String, DepsObject> = [
        ("comp-a".to_string(), deps(&[("lodash", "^4.17.0")])),
        ("comp-b".to_string(), deps(&[("lodash", "^3.0.0")])),
    ]
    .into();
    let policy = [
        policy("lodash", "4.17.21", Lifecycle::Runtime, None),
        policy("react", "^18.0.0", Lifecycle::Peer, Some(false)),
        policy("snap", "abc1234", Lifecycle::Runtime, Some(false)),
    ];
    let deduped = dedupe(&policy, &components, false).unwrap();
    let root_deps = deduped.root.get(Field::Dependencies);
    assert_eq!(root_deps.get("lodash").map(String::as_str), Some("4.17.21"));
    assert_eq!(root_deps.get("snap").map(String::as_str), Some("0.0.0-abc1234"));
    assert_eq!(
        deduped.root
            .get(Field::PeerDependencies)
            .get("react")
            .map(String::as_str),
        Some("^18.0.0"),
    );
    assert!(!deduped.components.contains_key("comp-a"));
    assert_eq!(deduped.components["comp-b"].get(Field::Dependencies)["lodash"], "^3.0.0");
}

#[test]
fn policy_manifest_snaps_hashes() {
    let manifest = policy_manifest(&[
        policy("a", "1234567", Lifecycle::Runtime, None),
        policy("b", "^1", Lifecycle::Peer, None),
    ]);
    assert_eq!(manifest.get(Field::Dependencies)["a"], "0.0.0-1234567");
    assert_eq!(manifest.get(Field::PeerDependencies)["b"], "^1");
}

#[test]
fn workspace_specs_are_excluded() {
    let map: DependencyMap = [("a", "workspace:*"), ("b", "file:../b"), ("c", "^1.0.0")]
        .into_iter()
        .map(|(name, spec)| (name.to_string(), spec.to_string()))
        .collect();
    assert_eq!(exclude_workspace(&map).into_keys().collect::<Vec<_>>(), ["c"]);
}

#[test]
fn most_common_snap_hash_wins_over_valid_ranges() {
    let deduped =
        single(&["^4.0.0", "00000001", "00000001", "00000001", "^4.0.4"], Field::DevDependencies);
    assert_eq!(root(&deduped, Field::DevDependencies), Some("00000001"));
    for index in [1, 2, 3] {
        assert!(!deduped.components.contains_key(&origin(index)));
    }
    assert_eq!(component(&deduped, 0, Field::DevDependencies), Some("^4.0.0"));
    assert_eq!(component(&deduped, 4, Field::DevDependencies), Some("^4.0.4"));
}
