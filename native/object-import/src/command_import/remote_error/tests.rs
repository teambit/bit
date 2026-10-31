use super::{mark, message};
#[test]
fn remote_inflate_keeps_legacy_display_but_exposes_real_scoped_zlib_failure() {
    let error = crate::checkout::repository::inflate(b"not a zlib object", 1024).unwrap_err();
    let error = mark(Some("actual.remote"), error);
    assert_eq!(error.to_string(), "checkout invalid compressed object");
    assert_eq!(
        message(&error).unwrap(),
        "remote actual.remote responded with the following error:\nfatal: zlib.inflate has failed with an error: \"incorrect header check\"\ntry running bit import --all-history to fix the corrupted objects",
    );
}
#[test]
fn local_and_non_inflate_failures_are_not_reclassified() {
    let error = crate::checkout::repository::inflate(b"invalid", 1024).unwrap_err();
    assert!(message(&mark(None, error)).is_none());
    let error = std::io::Error::new(std::io::ErrorKind::PermissionDenied, "permission denied");
    let error = mark(Some("actual.remote"), error);
    assert_eq!(error.kind(), std::io::ErrorKind::PermissionDenied);
    assert!(message(&error).is_none());
}
