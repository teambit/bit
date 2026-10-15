use super::{Prepared, document, proof, validate_destination};
use serde_json::json;
use std::{
    fs,
    path::PathBuf,
    sync::atomic::{AtomicUsize, Ordering},
};
static NEXT: AtomicUsize = AtomicUsize::new(0);
struct Fixture(PathBuf);
impl Fixture {
    fn new() -> Self {
        let path = std::env::temp_dir()
            .join(format!(
                "bit-reset-config-{}-{}",
                std::process::id(),
                NEXT.fetch_add(1, Ordering::Relaxed),
            ));
        fs::create_dir_all(&path).unwrap();
        Self(path)
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        let _removed = fs::remove_dir_all(&self.0);
    }
}

#[test]
fn scope_projection_preserves_specific_precedence_and_propagation() {
    let stored = json!({"extensions":[
        {"name":"teambit.dependencies/dependency-resolver","config":{"__specific":true,"policy":{"devDependencies":{"types":"new"}}}},
        {"name":"teambit.envs/envs","config":{"env":"teambit.harmony/node"}},
        {"name":"teambit.dependencies/dependency-resolver","config":{"policy":{"devDependencies":{"types":"old"}}}},
    ]});
    let output =
        document("local.scope/name", "1.0.0", &stored, &json!({"propagate":true})).unwrap();
    assert_eq!(
        output["extensions"]["teambit.dependencies/dependency-resolver"],
        json!({"policy":{"devDependencies":{"types":"new"}}}),
    );
    assert_eq!(
        output["extensions"]
            .as_object()
            .unwrap()
            .keys()
            .collect::<Vec<_>>(),
        vec!["teambit.dependencies/dependency-resolver", "teambit.envs/envs"],
    );
    let stopped =
        document("local.scope/name", "1.0.0", &stored, &json!({"propagate":false})).unwrap();
    assert_eq!(
        stopped["extensions"]
            .as_object()
            .unwrap()
            .len(),
        1,
    );
    assert_eq!(
        stopped["componentId"],
        json!({"scope":"local.scope","name":"name","version":"1.0.0"}),
    );
    assert_eq!(stopped["propagate"], false);
    assert_eq!(document("local.scope/name", "1.0.0", &stored, &json!({})).unwrap(), stopped);
    assert!(
        document(
            "local.scope/name",
            "1.0.0",
            &json!({"extensions":[{"name":"custom/env","config":{}}]}),
            &json!({"propagate":true})
        )
        .is_err(),
    );
}

#[test]
fn metadata_write_declines_unsupported_platform_before_changes() {
    let fixture = Fixture::new();
    let path = fixture.0.join("component.json");
    fs::write(&path, b"original").unwrap();
    let supported = validate_destination(&path);
    assert_eq!(supported.is_ok(), cfg!(target_os = "linux"));
    assert_eq!(fs::read(&path).unwrap(), b"original");
}

#[cfg(target_os = "linux")]
#[test]
fn config_commit_preserves_mode_and_rejects_stale_contents_and_attributes() {
    use std::os::unix::fs::{MetadataExt, PermissionsExt};
    let fixture = Fixture::new();
    let path = fixture.0.join("component.json");
    fs::write(&path, b"original").unwrap();
    fs::set_permissions(&path, fs::Permissions::from_mode(0o640)).unwrap();
    let before = fs::metadata(&path).unwrap();
    let mut proofs = Vec::new();
    proof::read(&path, &mut proofs).unwrap();
    let prepared = Prepared { proofs, writes: vec![(path.clone(), b"replacement\n".to_vec())] };
    prepared.validate().unwrap();
    prepared.commit().unwrap();
    let after = fs::metadata(&path).unwrap();
    assert_eq!(
        (before.uid(), before.gid(), before.mode()),
        (after.uid(), after.gid(), after.mode()),
    );
    assert_eq!(fs::read(&path).unwrap(), b"replacement\n");
    assert!(prepared.validate().is_err());
    xattr::set(&path, "user.bit-reset-test", b"retained").unwrap();
    assert!(validate_destination(&path).is_err());
    assert_eq!(fs::read(&path).unwrap(), b"replacement\n");
}

#[cfg(unix)]
#[test]
fn config_parent_aliases_are_rejected_and_ancestor_replacement_invalidates_plan() {
    use std::os::unix::fs::symlink;
    let fixture = Fixture::new();
    let directory = fixture.0.join("component");
    let replacement = fixture.0.join("replacement");
    fs::create_dir(&directory).unwrap();
    fs::create_dir(&replacement).unwrap();
    let mut proofs = Vec::new();
    super::paths::capture(&fixture.0, &directory.join("component.json"), &mut proofs).unwrap();
    fs::remove_dir(&directory).unwrap();
    symlink(&replacement, &directory).unwrap();
    assert!(proof::verify(&proofs).is_err());
    assert!(
        super::paths::capture(&fixture.0, &directory.join("component.json"), &mut Vec::new())
            .is_err(),
    );
    assert!(!replacement.join("component.json").exists());
}

#[test]
fn historical_duplicate_is_removed_before_specific_partitioning() {
    let stored = json!({"extensions":[
        {"name":"teambit.dependencies/dependency-resolver","config":{"policy":{"dependencies":{"pkg":"first"}}}},
        {"name":"teambit.dependencies/dependency-resolver","config":{"__specific":true,"policy":{"dependencies":{"pkg":"second"}}}},
    ]});
    let propagated =
        document("local.scope/name", "1.0.0", &stored, &json!({"propagate":true})).unwrap();
    assert_eq!(
        propagated["extensions"]["teambit.dependencies/dependency-resolver"]["policy"]["dependencies"]
            ["pkg"],
        "first",
    );
    let stopped =
        document("local.scope/name", "1.0.0", &stored, &json!({"propagate":false})).unwrap();
    assert_eq!(stopped["extensions"], json!({}));
}
