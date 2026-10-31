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

#[test]
fn node_path_lookup_uses_windows_executables_and_preserves_path_precedence() {
    use std::{fs, path::Path};
    let directory = std::env::temp_dir().join(super::uuid_v4().unwrap());
    let first = directory.join("first");
    let second = directory.join("second");
    fs::create_dir_all(&first).unwrap();
    fs::create_dir_all(&second).unwrap();
    fs::write(first.join("node.exe"), b"windows executable").unwrap();
    fs::write(second.join("node"), b"unix executable").unwrap();
    let lookup = |windows| {
        super::node_in_paths(
            Path::new("node"),
            [first.clone(), second.clone()].into_iter(),
            windows,
        )
    };
    assert_eq!(lookup(true), Some(first.join("node.exe")));
    assert_eq!(lookup(false), Some(second.join("node")));
    assert_eq!(
        super::node_in_paths(Path::new("node.exe"), [first.clone()].into_iter(), true),
        Some(first.join("node.exe")),
    );
    assert_eq!(super::node_in_paths(Path::new("missing"), [first].into_iter(), true), None);
    fs::remove_dir_all(directory).unwrap();
}
