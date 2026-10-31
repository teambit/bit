use super::Recovery;
use serde_json::{Value, json};
use std::{
    fs,
    path::PathBuf,
    sync::atomic::{AtomicUsize, Ordering},
};

struct Workspace(PathBuf);
impl Workspace {
    fn new() -> Self {
        static NEXT: AtomicUsize = AtomicUsize::new(0);
        let root = std::env::temp_dir()
            .join(format!(
                "bit-lane-recovery-{}-{}",
                std::process::id(),
                NEXT.fetch_add(1, Ordering::Relaxed),
            ));
        fs::create_dir_all(root.join(".bit/staged-config")).unwrap();
        fs::write(root.join(".bitmap"), "before bitmap").unwrap();
        fs::write(root.join("workspace.jsonc"), "before config").unwrap();
        Self(root)
    }
}
impl Drop for Workspace {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

#[test]
fn recovery_retains_original_bytes_after_merge_and_replaces_old_backup_file() {
    let workspace = Workspace::new();
    let root = &workspace.0;
    fs::write(root.join(".bit/staged-snaps"), "").unwrap();
    fs::write(root.join(".bit/staged-config/main.json"), "[]").unwrap();
    fs::write(root.join(".bit/last-merged"), "old file").unwrap();
    let recovery = Recovery::prepare(root, &json!({"current":null})).unwrap();
    fs::write(root.join(".bitmap"), "after bitmap").unwrap();
    assert!(recovery.validate().is_err());
    recovery.commit().unwrap();
    assert_eq!(fs::read(root.join(".bit/last-merged/bitmap")).unwrap(), b"before bitmap");
    assert_eq!(fs::read(root.join(".bit/last-merged/workspace.jsonc")).unwrap(), b"before config");
    assert_eq!(fs::read(root.join(".bit/last-merged/staged-snaps")).unwrap(), b"");
    assert!(!root.join(".bit/last-merged/staged-config.json").exists());
}

#[test]
fn recovery_keeps_nonempty_staged_configuration_exactly() {
    let workspace = Workspace::new();
    let bytes = b"[ {\"id\": \"scope/component\"} ]\n";
    fs::write(workspace.0.join(".bit/staged-config/main.json"), bytes).unwrap();
    let recovery = Recovery::prepare(&workspace.0, &json!({"current":null})).unwrap();
    recovery.commit().unwrap();
    assert_eq!(fs::read(workspace.0.join(".bit/last-merged/staged-config.json")).unwrap(), bytes);
}

#[cfg(unix)]
#[test]
fn recovery_preserves_copy_permissions_and_rejects_stale_modes() {
    use std::os::unix::fs::PermissionsExt;
    let workspace = Workspace::new();
    let bitmap = workspace.0.join(".bitmap");
    fs::set_permissions(&bitmap, fs::Permissions::from_mode(0o600)).unwrap();
    let recovery = Recovery::prepare(&workspace.0, &json!({"current":null})).unwrap();
    fs::set_permissions(&bitmap, fs::Permissions::from_mode(0o640)).unwrap();
    assert!(recovery.validate().is_err());
    recovery.commit().unwrap();
    assert_eq!(
        fs::metadata(workspace.0.join(".bit/last-merged/bitmap"))
            .unwrap()
            .permissions()
            .mode()
            & 0o777,
        0o600,
    );
}

#[test]
fn lane_backup_uses_current_lane_and_javascript_utf16_header_length() {
    use std::io::Read;
    let workspace = Workspace::new();
    let hash = "a".repeat(40);
    let lane = json!({"name":"feature","scope":"scope","components":[],"log":{"date":"1","username":"🦀"}});
    let context = json!({"currentId":{"scope":"scope","name":"feature"},"current":{"hash":hash,"value":lane}});
    fs::create_dir_all(workspace.0.join(".bit/staged-config/scope")).unwrap();
    fs::write(workspace.0.join(".bit/staged-config/scope/feature.json"), "[1]").unwrap();
    fs::write(workspace.0.join(".bit/staged-config/main.json"), "[2]").unwrap();
    let recovery = Recovery::prepare(&workspace.0, &context).unwrap();
    recovery.commit().unwrap();
    assert_eq!(fs::read(workspace.0.join(".bit/last-merged/staged-config.json")).unwrap(), b"[1]");
    let compressed = fs::read(workspace.0.join(".bit/last-merged/lane")).unwrap();
    let mut decoded = Vec::new();
    flate2::read::ZlibDecoder::new(&compressed[..]).read_to_end(&mut decoded).unwrap();
    let boundary = decoded
        .iter()
        .position(|byte| *byte == 0)
        .unwrap();
    let body = std::str::from_utf8(&decoded[boundary + 1..]).unwrap();
    assert_eq!(serde_json::from_str::<Value>(body).unwrap(), lane);
    assert_eq!(
        std::str::from_utf8(&decoded[..boundary]).unwrap(),
        format!("Lane {hash} {}", body.encode_utf16().count()),
    );
    assert_ne!(body.len(), body.encode_utf16().count());
}
