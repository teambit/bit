//! Unit tests for stream-error variant matching ([`assert_errors`]) in replay output comparison suites.
//!
//! Verifies [`variants`] acceptance and rejection of altered scope names or extra stderr lines.

use super::assert_errors;

/// Returns the two expected `zlib.inflate` corruption error string variants for [`assert_errors`] tests.
fn variants() -> [String; 2] {
    let body = "fatal: zlib.inflate has failed with an error: \"incorrect header check\"\ntry running bit import --all-history to fix the corrupted objects";
    [body.into(), format!("remote actual.remote responded with the following error:\n{body}")]
}

/// Verifies that [`assert_errors`] accepts any pairing of the two complete independent stream error [`variants`].
#[test]
fn only_the_two_complete_independent_stream_errors_are_accepted() {
    let variants = variants();
    for actual in &variants {
        for expected in &variants {
            assert_errors(actual, expected, &variants);
        }
    }
    assert_ne!(variants[0], variants[1]);
}

/// Verifies that [`assert_errors`] panics when scope names, causes, advice, or extra lines diverge from [`variants`].
#[test]
fn changed_scope_cause_advice_and_extra_output_are_rejected() {
    let variants = variants();
    let wrong = [
        variants[1].replace("actual.remote", "another.remote"),
        variants[0].replace("incorrect header check", "permission denied"),
        variants[0].replace("import --all-history", "reset --hard"),
        format!("extra\n{}", variants[0]),
        format!("{}\nextra", variants[1]),
        String::new(),
    ];
    for error in &wrong {
        assert!(
            std::panic::catch_unwind(|| assert_errors(error, &variants[0], &variants)).is_err(),
        );
        assert!(
            std::panic::catch_unwind(|| assert_errors(&variants[1], error, &variants)).is_err(),
        );
    }
}
