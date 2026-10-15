use super::{Operation, State, bitmap, jsonc};
use serde_json::json;
use std::{
    fs,
    path::PathBuf,
    sync::atomic::{AtomicUsize, Ordering},
};
static SEQUENCE: AtomicUsize = AtomicUsize::new(0);
struct Fixture(PathBuf);
impl Fixture {
    fn new() -> Self {
        let path = std::env::temp_dir()
            .join(format!(
                "bit-recovery-{}-{}",
                std::process::id(),
                SEQUENCE.fetch_add(1, Ordering::Relaxed),
            ));
        fs::create_dir_all(&path).unwrap();
        Self(path)
    }
    fn file(&self, name: &str, bytes: &[u8]) -> PathBuf {
        let path = self.0.join(name);
        fs::write(&path, bytes).unwrap();
        path
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        let _removed = fs::remove_dir_all(&self.0);
    }
}
#[test]
fn jsonc_comments_trailing_commas_and_string_escapes_are_preserved() {
    let value = jsonc::parse(
        br#"{/*comment*/"url":"https://example/\"x", "array":[1,2,],//line
        "next":true,}"#,
    )
    .unwrap();
    assert_eq!(value, json!({"url":r#"https://example/"x"#,"array":[1,2],"next":true}));
    assert!(jsonc::parse(b"{/* unfinished").is_err());
    assert!(jsonc::parse(b"{unquoted:1}").is_err());
    assert!(jsonc::parse(b"{,}").is_err());
    assert!(jsonc::parse(b"{\"bad\":,}").is_err());
}
#[test]
fn bitmap_root_membership_includes_removed_components() {
    let fixture = Fixture::new();
    let path = fixture.file(
        "bitmap",
        br#"{"$schema-version":"17.0.0","one":{"scope":"","defaultScope":"q.s","rootDir":"first","removed":true},}"#,
    );
    assert_eq!(
        bitmap(&path, &["first".into(), "later".into()]).unwrap(),
        json!({"removeDirs":["later"]}),
    );
}
#[test]
fn invalid_bitmap_identity_and_duplicate_dirs_decline() {
    let fixture = Fixture::new();
    for body in [
        br#"{"one":{"rootDir":"x"}}"#.as_slice(),
        br#"{"one":{"scope":"a","version":"1.0.0"}}"#,
        br#"{"one":{"scope":"","rootDir":"x"},"two":{"scope":"","rootDir":"x"}}"#,
    ] {
        let path = fixture.file("bitmap", body);
        assert!(bitmap(&path, &[]).is_err());
    }
}
#[test]
fn malformed_whole_operation_list_never_mutates() {
    let fixture = Fixture::new();
    let path = fixture.file("keep", b"body");
    let mut state = State::default();
    assert!(
        state
            .initialize(
                vec![
                    Operation::Remove { path: path.clone() },
                    Operation::EnsureDir { path: "relative".into() }
                ],
                b"invalid"
            )
            .is_err(),
    );
    assert_eq!(fs::read(path).unwrap(), b"body");
}
#[test]
fn failed_prefix_does_not_repeat_completed_steps() {
    let fixture = Fixture::new();
    let removed = fixture.file("removed", b"body");
    let blocked = fixture.file("blocked", b"body");
    let operations = vec![
        Operation::Remove { path: removed.clone() },
        Operation::EnsureDir { path: blocked.clone() },
        Operation::EnsureDir { path: fixture.0.join("later") },
    ];
    let mut state = State::default();
    let token = state.initialize(operations, b"prefix").unwrap()["token"]
        .as_str()
        .unwrap()
        .to_owned();
    assert_eq!(
        state.advance(&token, 3).unwrap(),
        json!({"completed":1,"nextIndex":1,"failed":true}),
    );
    fs::write(&removed, b"new").unwrap();
    fs::remove_file(blocked).unwrap();
    assert_eq!(
        state.advance(&token, 2).unwrap(),
        json!({"completed":2,"nextIndex":3,"failed":false}),
    );
    assert_eq!(fs::read(removed).unwrap(), b"new");
    assert!(state.advance("stale", 1).is_err());
}
#[cfg(target_os = "linux")]
#[test]
fn copy_reads_fresh_and_preserves_existing_inode_mode() {
    use std::os::unix::fs::{MetadataExt, PermissionsExt};
    let fixture = Fixture::new();
    let source = fixture.file("source", b"before");
    let destination = fixture.file("destination", b"old");
    let inode = fs::metadata(&destination).unwrap().ino();
    let mut state = State::default();
    let token = state
        .initialize(
            vec![Operation::Copy { source: source.clone(), destination: destination.clone() }],
            b"copy",
        )
        .unwrap()["token"]
        .as_str()
        .unwrap()
        .to_owned();
    fs::write(&source, b"after").unwrap();
    fs::set_permissions(&source, fs::Permissions::from_mode(0o640)).unwrap();
    assert_eq!(state.advance(&token, 1).unwrap()["completed"], 1);
    assert_eq!(fs::read(&destination).unwrap(), b"after");
    assert_eq!(fs::metadata(&destination).unwrap().ino(), inode);
    assert_eq!(fs::metadata(destination).unwrap().mode() & 0o777, 0o640);
}
#[cfg(unix)]
#[test]
fn copy_links_decline_without_destination_mutation() {
    use std::os::unix::fs::symlink;
    let fixture = Fixture::new();
    let source = fixture.file("source", b"fresh");
    let destination = fixture.file("destination", b"keep");
    let link = fixture.0.join("link");
    symlink(&source, &link).unwrap();
    assert!(super::copy::file(&link, &destination).is_err());
    fs::hard_link(&source, fixture.0.join("hard")).unwrap();
    assert!(super::copy::file(&source, &destination).is_err());
    assert_eq!(fs::read(destination).unwrap(), b"keep");
}
#[test]
fn prototype_roots_and_workspace_root_decline() {
    let fixture = Fixture::new();
    let path = fixture.file("bitmap", b"{}");
    for key in [".", "constructor", "toString", "valueOf", "hasOwnProperty", "__proto__"] {
        assert!(bitmap(&path, &[key.into()]).is_err());
    }
}
#[test]
fn reinitializing_identical_plan_invalidates_previous_token() {
    let fixture = Fixture::new();
    let path = fixture.file("keep", b"body");
    let mut state = State::default();
    let first = state
        .initialize(vec![Operation::Remove { path: path.clone() }], b"same")
        .unwrap()["token"]
        .as_str()
        .unwrap()
        .to_owned();
    let second = state
        .initialize(vec![Operation::Remove { path: path.clone() }], b"same")
        .unwrap()["token"]
        .as_str()
        .unwrap()
        .to_owned();
    assert_ne!(first, second);
    assert!(state.advance(&first, 1).is_err());
    assert_eq!(fs::read(path).unwrap(), b"body");
}
#[cfg(not(target_os = "linux"))]
#[test]
fn unqualified_copy_platform_declines_without_mutation() {
    let fixture = Fixture::new();
    let source = fixture.file("source", b"fresh");
    let destination = fixture.file("destination", b"keep");
    assert!(super::copy::file(&source, &destination).is_err());
    assert_eq!(fs::read(destination).unwrap(), b"keep");
}

#[test]
fn unscoped_bitmap_requires_canonical_default_scope() {
    let fixture = Fixture::new();
    for scope in [json!(""), json!(null)] {
        let path = fixture.file(
            "bitmap",
            &serde_json::to_vec(&json!({"one":{"scope":scope,"rootDir":"first"}})).unwrap(),
        );
        assert!(bitmap(&path, &[]).is_err());
    }
}
#[cfg(target_os = "linux")]
#[test]
fn copy_extended_acl_declines_without_mutating_destination() {
    let fixture = Fixture::new();
    let source = fixture.file("source", b"fresh");
    let destination = fixture.file("destination", b"keep");
    let mut acl = 2_u32.to_le_bytes().to_vec();
    for (tag, permission, id) in [
        (1_u16, 6_u16, u32::MAX),
        (2, 4, 1001),
        (4, 4, u32::MAX),
        (16, 4, u32::MAX),
        (32, 0, u32::MAX),
    ] {
        acl.extend(tag.to_le_bytes());
        acl.extend(permission.to_le_bytes());
        acl.extend(id.to_le_bytes());
    }
    if let Err(error) = xattr::set(&source, "system.posix_acl_access", &acl) {
        assert_eq!(error.kind(), std::io::ErrorKind::Unsupported);
        return;
    }
    assert!(super::copy::file(&source, &destination).is_err());
    assert_eq!(fs::read(destination).unwrap(), b"keep");
}
