use super::{parse, persist_failure, validation_failure};

#[test]
fn parses_the_native_flags() {
    let empty = parse(&[]).unwrap();
    assert!(empty.ids.is_empty() && !empty.origin_directly && empty.resume.is_none());
    let selected =
        parse(&["s/a@1.0.0", "s/b", "--origin-directly", "--resume", "client-1"]).unwrap();
    assert_eq!(selected.ids, ["s/a@1.0.0", "s/b"]);
    assert!(selected.origin_directly);
    assert_eq!(selected.resume.as_deref(), Some("client-1"));
    for args in [
        &["--resume"][..],
        &["--resume", "bad:id"],
        &["--all"],
        &["-e"],
        &["s/a", "--origin-directly", "--origin-directly"],
    ] {
        assert!(parse(args).is_none(), "{args:?}");
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

#[test]
fn reports_failed_validation_without_repeating_remote_actions() {
    let scopes = ["a".to_string(), "b".to_string()];
    let error =
        "the engine declined commandOutboundApply: outbound validate failed: remote rejected";
    assert_eq!(
        validation_failure(error, &scopes).as_deref(),
        Some("remote rejected\nthe following scopes were used for this export: a, b"),
    );
    assert!(validation_failure("outbound persist failed: a: busy", &scopes).is_none());
}
