use super::{intersections, safe_intersect};
use pnpm_resolving_deps_resolver::{MissingPeer, PeerDependencyIssues};
use pretty_assertions::assert_eq;

fn missing(wanted_range: &str, optional: bool) -> MissingPeer {
    MissingPeer {
        parents: pnpm_resolving_deps_resolver::ParentChain::default(),
        optional,
        wanted_range: wanted_range.to_string(),
        raw_range: wanted_range.to_string(),
    }
}

#[test]
fn a_single_range_passes_through() {
    assert_eq!(safe_intersect(["^1.0.0"].into_iter()).as_deref(), Some("^1.0.0"));
}

#[test]
fn ranges_are_intersected() {
    let intersection = safe_intersect(["^1.0.0", ">=1.2.0"].into_iter()).expect("intersection");
    assert!(
        node_semver::Version::parse("1.2.0")
            .expect("version")
            .satisfies(&intersection.parse().expect("range")),
    );
    assert!(
        !node_semver::Version::parse("1.1.0")
            .expect("version")
            .satisfies(&intersection.parse().expect("range")),
    );
}

#[test]
fn disjoint_ranges_conflict() {
    assert_eq!(safe_intersect(["^1.0.0", "^2.0.0"].into_iter()), None);
}

#[test]
fn intersections_skip_optional_peers_and_conflicts() {
    let issues = PeerDependencyIssues {
        missing: [
            ("react".to_string(), vec![missing("^18.0.0", false)]),
            ("optional".to_string(), vec![missing("^1.0.0", true)]),
            ("conflict".to_string(), vec![missing("^1.0.0", false), missing("^2.0.0", false)]),
        ]
        .into_iter()
        .collect(),
        ..PeerDependencyIssues::default()
    };
    let result = intersections(&issues);
    assert_eq!(result.len(), 1);
    assert_eq!(result["react"], "^18.0.0");
}
