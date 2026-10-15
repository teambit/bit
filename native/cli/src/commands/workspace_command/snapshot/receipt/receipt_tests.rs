use super::{new_snap_hash, uuid_v4};

#[test]
fn uuids_are_version_4() {
    let uuid = uuid_v4().unwrap();
    let parts: Vec<&str> = uuid.split('-').collect();
    assert_eq!(
        parts
            .iter()
            .map(|part| part.len())
            .collect::<Vec<_>>(),
        [8, 4, 4, 4, 12],
    );
    assert!(parts[2].starts_with('4'));
    assert!(matches!(parts[3].as_bytes()[0], b'8' | b'9' | b'a' | b'b'));
    assert_ne!(uuid, uuid_v4().unwrap());
}

#[test]
fn snap_hashes_are_sha1_hex() {
    let hash = new_snap_hash().unwrap();
    assert_eq!(hash.len(), 40);
    assert!(
        hash.bytes()
            .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase()),
    );
}

#[test]
fn git_config_values_end_at_the_next_equals_sign_and_the_last_wins() {
    let config = super::parse_git_config(
        "user.name=Global\nuser.email=a@b.c\ncore.x\nuser.name=Local=Name\n",
    );
    assert_eq!(config.get("user.name").map(String::as_str), Some("Local"));
    assert_eq!(config.get("user.email").map(String::as_str), Some("a@b.c"));
    assert!(!config.contains_key("core.x"));
}
