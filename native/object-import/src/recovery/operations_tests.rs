use super::{Operation, State};
#[test]
fn token_revision_exhaustion_discards_previous_plan() {
    let mut state = State {
        token: Some("old".into()),
        operations: vec![Operation::Remove { path: std::env::temp_dir().join("not-used") }],
        index: 0,
        revision: u64::MAX,
    };
    assert!(
        state
            .initialize(
                vec![Operation::EnsureDir { path: std::env::temp_dir().join("not-used") }],
                b"new"
            )
            .is_err(),
    );
    assert!(state.token.is_none());
    assert!(state.operations.is_empty());
    assert!(state.advance("old", 1).is_err());
}
