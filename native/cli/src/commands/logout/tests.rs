use super::{clear_auth_config, valid_args};
use serde_json::json;
use std::{ffi::OsString, fs};
use tempfile::tempdir;

fn os_args(args: &[&str]) -> Vec<OsString> {
    args.iter()
        .map(OsString::from)
        .collect()
}

#[test]
fn parses_valid_args() {
    assert!(valid_args(&os_args(&["logout"])));
    assert!(valid_args(&os_args(&["logout", "--no-color"])));
}

#[test]
fn rejects_invalid_args() {
    assert!(!valid_args(&os_args(&["logout", "unexpected"])));
    assert!(!valid_args(&os_args(&["logout", "--json"])));
    assert!(!valid_args(&os_args(&["logout", "-h"])));
}

#[test]
fn clears_user_credentials_from_global_config() {
    let dir = tempdir().unwrap();
    let config_path = dir.path().join("config.json");
    let initial = json!({
        "user.token": "secret123",
        "user.name": "alice",
        "other.key": "preserve_me"
    });
    fs::write(&config_path, serde_json::to_vec_pretty(&initial).unwrap()).unwrap();

    clear_auth_config(dir.path()).unwrap();

    let updated: serde_json::Value =
        serde_json::from_str(&fs::read_to_string(&config_path).unwrap()).unwrap();
    assert_eq!(updated.get("user.token"), None);
    assert_eq!(updated.get("user.name"), None);
    assert_eq!(
        updated.get("other.key"),
        Some(&serde_json::Value::String("preserve_me".to_owned())),
    );
}
