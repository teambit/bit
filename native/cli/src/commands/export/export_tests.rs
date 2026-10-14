use super::{parse, persist_failure};

#[test]
fn parses_the_native_flags() {
    assert_eq!(parse(&[]), Some(false));
    assert_eq!(parse(&["--origin-directly"]), Some(true));
    for args in [&["s/a"][..], &["--resume", "x"], &["--all"], &["-e"]] {
        assert_eq!(parse(args), None, "{args:?}");
    }
}

#[test]
fn reports_a_failed_persist_like_persist_failed() {
    let scopes = ["a".to_string(), "b".to_string()];
    let error =
        "the engine declined commandOutboundApply: outbound persist failed: b: server is busy";
    let (index, message) = persist_failure(error, &scopes).unwrap();
    assert_eq!(index, 1);
    assert_eq!(
        message,
        "failed persisting to the following scopes: b\nerrors:\nb - server is busy\n\nthe remote bit.dev will try to re-persist the data for the failed scopes.\n   \nthe following scopes were used for this export: a, b",
    );
    assert!(persist_failure("outbound validate failed: conflict", &scopes).is_none());
}
