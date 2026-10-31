use super::{Fixture, prepare, prepare_cached};

#[test]
fn cached_graph_import_has_no_fetcher_phase_and_versionless_roots_are_not_unbuilt_requests() {
    let fixture = Fixture::new();
    fixture.model(&"a".repeat(40));
    fixture.imported().commit().unwrap();
    let mut cached = prepare_cached(&fixture.root, &fixture.global).unwrap();
    cached
        .prepare_graph_versions(&fixture.root, &[Fixture::target()], &[])
        .unwrap();
    assert!(cached.progress.is_empty());
    let mut latest = Fixture::target();
    "latest".clone_into(&mut latest.version);
    let latest = super::super::prepare_graph_inbound_with_virtual(
        &fixture.root,
        &fixture.global,
        &[latest],
        &[],
        false,
        false,
    )
    .unwrap();
    let pinned = prepare(&fixture.root, &fixture.global, &[Fixture::target()]).unwrap();
    let missing = |plan: &super::PreparedImport| {
        plan.progress
            .iter()
            .filter(|row| {
                row.reason.as_deref() == Some("for getting missing versions and dependencies")
            })
            .map(|row| row.ids.len())
            .sum::<usize>()
    };
    assert_eq!(missing(&latest), 0);
    assert_eq!(missing(&pinned), 1);
}
