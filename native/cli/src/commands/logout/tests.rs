//! Unit tests for `bit logout` CLI argument validation ([`valid_args`]) and global credential cleanup ([`clear_auth_config`]).
//!
//! Verifies `--no-color` flag acceptance and removal of authentication keys from global config.

use super::{clear_auth_config, valid_args};
use serde_json::json;
use std::{ffi::OsString, fs};
use tempfile::tempdir;

/// Converts string slices into owned [`OsString`] CLI arguments for `logout` tests.
fn os_args(args: &[&str]) -> Vec<OsString> {
    args.iter()
        .map(OsString::from)
        .collect()
}

/// Verifies that [`valid_args`] accepts `logout` with optional `--no-color` [`os_args`] spellings.
#[test]
fn parses_valid_args() {
    assert!(valid_args(&os_args(&["logout"])));
    assert!(valid_args(&os_args(&["logout", "--no-color"])));
    assert!(valid_args(&os_args(&["logout", "--no-color=true"])));
    assert!(valid_args(&os_args(&["logout", "--no-color=false"])));
}

/// Verifies that [`valid_args`] rejects positional [`os_args`] arguments and unsupported flags on `bit logout`.
#[test]
fn rejects_invalid_args() {
    assert!(!valid_args(&os_args(&["logout", "unexpected"])));
    assert!(!valid_args(&os_args(&["logout", "--json"])));
    assert!(!valid_args(&os_args(&["logout", "-h"])));
}

/// Verifies that [`clear_auth_config`] removes `user.token` and `user.name` while preserving unrelated config keys.
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

/// Verifies that [`clear_auth_config`] succeeds as a no-op when `config.json` does not exist on disk.
#[test]
fn clear_auth_config_succeeds_when_config_file_does_not_exist() {
    let dir = tempdir().unwrap();
    clear_auth_config(dir.path()).unwrap();
}
