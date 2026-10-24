use super::{Chalk, known_global_dirs, parse_json_flag, render_json, render_report};
use std::{ffi::OsString, path::Path};

#[test]
fn parses_globals_json_flags() {
    assert_eq!(parse_json_flag(&[OsString::from("globals")]), Some(false));
    assert_eq!(parse_json_flag(&[OsString::from("globals"), OsString::from("-j")]), Some(true));
    assert_eq!(parse_json_flag(&[OsString::from("globals"), OsString::from("--json")]), Some(true));
    assert_eq!(
        parse_json_flag(&[OsString::from("globals"), OsString::from("--no-json")]),
        Some(false),
    );
    assert_eq!(parse_json_flag(&[OsString::from("globals"), OsString::from("--help")]), None);
    assert_eq!(parse_json_flag(&[OsString::from("globals"), OsString::from("extra")]), None);
}

#[test]
fn renders_globals_text_and_json_formats() {
    let dirs = known_global_dirs(
        Path::new("/tmp/bit-globals"),
        Path::new("/tmp/bit-globals/config"),
        "/tmp/bit-globals/capsules",
    );
    let report = render_report(&dirs, Chalk::new(false));
    assert!(report.starts_with(
        r#"the following global directories are used by Bit. to change the global root directory, set the "BIT_GLOBALS_DIR" environment variable"#,
    ));
    let expected_scope = Path::new("/tmp/bit-globals").join("scope");
    assert!(report.contains("Global Dir        /tmp/bit-globals"));
    assert!(report.contains(&format!("Global Scope Dir  {}", expected_scope.display())));
    assert!(report.contains("Config Dir        /tmp/bit-globals/config"));
    assert!(report.contains("Capsules Dir      /tmp/bit-globals/capsules"));

    let json = render_json(&dirs).unwrap();
    let parsed: serde_json::Value = serde_json::from_str(&json).unwrap();
    assert_eq!(parsed["Global Dir"], "/tmp/bit-globals");
    assert_eq!(parsed["Config Dir"], "/tmp/bit-globals/config");
    assert_eq!(parsed["Capsules Dir"], "/tmp/bit-globals/capsules");
}
