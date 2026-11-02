//! Unit tests for recovery [`Operation`] and [`State`] token revision exhaustion ([`token_revision_exhaustion_discards_previous_plan`]) and plan invalidation in `bit-object-import`.

use super::{Operation, State};
/// Verifies that [`State::initialize`] fails on `u64::MAX` revision overflow and discards any prior [`Operation`] recovery plan in [`State`].
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
