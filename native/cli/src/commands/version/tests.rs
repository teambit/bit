use super::{parse_json_flag, render_version};
use std::ffi::OsString;

#[test]
fn parses_version_json_flags() {
    assert_eq!(parse_json_flag(&[OsString::from("version")]), Some(false));
    assert_eq!(parse_json_flag(&[OsString::from("version"), OsString::from("-j")]), Some(true));
    assert_eq!(parse_json_flag(&[OsString::from("version"), OsString::from("--json")]), Some(true));
    assert_eq!(
        parse_json_flag(&[OsString::from("version"), OsString::from("--no-json")]),
        Some(false),
    );
    assert_eq!(parse_json_flag(&[OsString::from("version"), OsString::from("--help")]), None);
}

#[test]
fn renders_version_text_and_json() {
    assert_eq!(render_version("1.2.3", false).unwrap(), "1.2.3");
    assert_eq!(render_version("1.2.3", true).unwrap(), "{\n  \"bit\": \"1.2.3\"\n}");
}
