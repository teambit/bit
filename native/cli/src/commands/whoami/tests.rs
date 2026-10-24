use super::parse_args;
use std::ffi::OsString;

fn os_args(args: &[&str]) -> Vec<OsString> {
    args.iter()
        .map(OsString::from)
        .collect()
}

#[test]
fn parses_valid_args() {
    assert_eq!(parse_args(&os_args(&["whoami"])), Some(None));
    assert_eq!(parse_args(&os_args(&["whoami", "--no-color"])), Some(None));
    assert_eq!(
        parse_args(&os_args(&["whoami", "--token", "test-token"])),
        Some(Some("test-token".to_owned())),
    );
    assert_eq!(
        parse_args(&os_args(&["whoami", "--token=my-tok", "--no-color"])),
        Some(Some("my-tok".to_owned())),
    );
}

#[test]
fn rejects_invalid_args() {
    assert_eq!(parse_args(&os_args(&["whoami", "unexpected"])), None);
    assert_eq!(parse_args(&os_args(&["whoami", "--unknown-flag"])), None);
    assert_eq!(parse_args(&os_args(&["whoami", "--token"])), None);
}
