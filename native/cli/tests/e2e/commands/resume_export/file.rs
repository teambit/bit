//! File pending-object recovery against restored scopes and the released CLI.
mod order;
use crate::helper::{Helper, Run};
use std::{
    collections::BTreeMap,
    ffi::OsStr,
    fs,
    path::{Path, PathBuf},
};

#[test]
fn file_pending_deletion_matches_without_a_published_runtime() {
    for bare in [false, true] {
        for present in [false, true] {
            let helper = fixture(present);
            let root = if bare {
                let (_, root) = helper.new_bare_scope_connected();
                root
            } else {
                helper.scopes.local_path.clone()
            };
            let command = format!(
                "resume-export fixture-export {} {} --delete --force",
                helper.scopes.remote, helper.scopes.remote,
            );
            compare(&helper, &root, &command, |_| {}, |_| {});
        }
    }
}

#[test]
fn invalid_file_export_ids_preserve_every_pending_directory() {
    for id in [
        ".",
        "..",
        "../other",
        "nested/client",
        r"back\slash",
        "bad:name",
        "bad?name",
        r#"bad"name"#,
    ] {
        let helper = fixture(true);
        let command = format!("resume-export '{id}' {} --delete --force", helper.scopes.remote);
        compare(&helper, &helper.scopes.local_path, &command, |_| {}, |_| {});
        assert_eq!(
            fs::read(helper.scopes.remote_path.join("pending-objects/fixture-export/object"))
                .unwrap(),
            b"fixture object",
        );
    }
}

#[test]
fn file_pending_deletion_declines_persistence_before_any_write() {
    let helper = fixture(true);
    let before = tree(&helper.scopes.remote_path);
    let unavailable = helper.scopes.e2e_dir.join("unavailable-node");
    let run = Helper::cmd_in_with(
        &helper.scopes.local_path,
        &format!("resume-export fixture-export {}", helper.scopes.remote),
        &[("BIT_NODE_BINARY", unavailable.as_os_str())],
    );
    assert!(!run.native, "{run:?}");
    assert_eq!(tree(&helper.scopes.remote_path), before);
}

#[test]
fn malformed_file_remote_declines_before_any_removal() {
    let helper = fixture(true);
    fs::write(helper.scopes.remote_path.join("scope.json"), "invalid json").unwrap();
    let before = tree(&helper.scopes.remote_path);
    let unavailable = helper.scopes.e2e_dir.join("unavailable-node");
    let run = Helper::cmd_in_with(
        &helper.scopes.local_path,
        &format!("resume-export fixture-export {} --delete --force", helper.scopes.remote),
        &[("BIT_NODE_BINARY", unavailable.as_os_str())],
    );
    assert!(!run.native, "{run:?}");
    assert_eq!(tree(&helper.scopes.remote_path), before);
}

#[cfg(unix)]
#[test]
fn file_pending_deletion_preserves_symlink_targets() {
    for target in ["missing", "unrelated", "unrelated/sentinel"] {
        let helper = fixture(false);
        std::os::unix::fs::symlink(
            target,
            helper.scopes.remote_path.join("pending-objects/fixture-export"),
        )
        .unwrap();
        let command =
            format!("resume-export fixture-export {} --delete --force", helper.scopes.remote);
        compare(&helper, &helper.scopes.local_path, &command, |_| {}, |_| {});
        assert_eq!(
            fs::read(helper.scopes.remote_path.join("pending-objects/unrelated/sentinel")).unwrap(),
            b"preserve",
        );
    }
}

#[cfg(unix)]
#[test]
fn file_pending_deletion_preserves_the_released_permission_failure_prefix() {
    use std::os::unix::fs::PermissionsExt;
    for relative in ["pending-objects", "pending-objects/fixture-export"] {
        let helper = fixture(true);
        let command =
            format!("resume-export fixture-export {} --delete --force", helper.scopes.remote);
        compare(
            &helper,
            &helper.scopes.local_path,
            &command,
            |scope| {
                fs::set_permissions(scope.join(relative), fs::Permissions::from_mode(0o555))
                    .unwrap();
            },
            |scope| {
                if scope.join(relative).exists() {
                    fs::set_permissions(scope.join(relative), fs::Permissions::from_mode(0o755))
                        .unwrap();
                }
            },
        );
    }
}

#[test]
fn mixed_file_and_http_pending_deletion_preserves_both_protocols() {
    use crate::helper::action_server::Server;
    use serde_json::{Value, json};
    let helper = fixture(true);
    let server = Server::start(4, |request| match request.body["name"].as_str().unwrap() {
        "PendingDirStatus" => (200, json!({"exists":true})),
        "RemovePendingDir" => (200, json!({"existed":true})),
        other => panic!("unexpected action {other}"),
    });
    let path = helper.scopes.local_path.join(".bit/scope.json");
    let mut scope: Value = serde_json::from_slice(&fs::read(&path).unwrap()).unwrap();
    scope["remotes"]["fixture.http"] = json!(server.url);
    fs::write(path, serde_json::to_vec_pretty(&scope).unwrap()).unwrap();
    let command = format!(
        "resume-export fixture-export {} fixture.http --delete --force",
        helper.scopes.remote,
    );
    compare_with_runtime(&helper, &helper.scopes.local_path, &command, |_| {}, |_| {}, true);
    let calls = server.finish();
    assert_eq!(calls[..2], calls[2..]);
    assert!(!helper.scopes.remote_path.join("pending-objects/fixture-export").exists());
}

#[cfg(windows)]
#[test]
fn file_pending_deletion_removes_readonly_files() {
    let helper = fixture(true);
    let command = format!("resume-export fixture-export {} --delete --force", helper.scopes.remote);
    compare(
        &helper,
        &helper.scopes.local_path,
        &command,
        |scope| {
            let path = scope.join("pending-objects/fixture-export/object");
            let mut permissions = fs::metadata(&path).unwrap().permissions();
            permissions.set_readonly(true);
            fs::set_permissions(path, permissions).unwrap();
        },
        |scope| {
            let path = scope.join("pending-objects/fixture-export/object");
            if path.exists() {
                let mut permissions = fs::metadata(&path).unwrap().permissions();
                permissions.set_readonly(false);
                fs::set_permissions(path, permissions).unwrap();
            }
        },
    );
    assert!(!helper.scopes.remote_path.join("pending-objects/fixture-export").exists());
}

#[cfg(windows)]
#[test]
fn file_pending_deletion_preserves_directory_link_targets() {
    let helper = fixture(false);
    let pending = helper.scopes.remote_path.join("pending-objects");
    std::os::windows::fs::symlink_dir(pending.join("unrelated"), pending.join("fixture-export"))
        .unwrap();
    let command = format!("resume-export fixture-export {} --delete --force", helper.scopes.remote);
    compare(&helper, &helper.scopes.local_path, &command, |_| {}, |_| {});
    assert_eq!(fs::read(pending.join("unrelated/sentinel")).unwrap(), b"preserve");
}

fn fixture(present: bool) -> Helper {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    let pending = helper.scopes.remote_path.join("pending-objects");
    fs::create_dir_all(pending.join("unrelated")).unwrap();
    fs::write(pending.join("unrelated/sentinel"), "preserve").unwrap();
    if present {
        fs::create_dir_all(pending.join("fixture-export")).unwrap();
        fs::write(pending.join("fixture-export/object"), "fixture object").unwrap();
    }
    helper
}

fn compare(
    helper: &Helper,
    root: &Path,
    command: &str,
    prepare: impl Fn(&Path),
    cleanup: impl Fn(&Path),
) {
    compare_with_runtime(helper, root, command, prepare, cleanup, false);
}

fn compare_with_runtime(
    helper: &Helper,
    root: &Path,
    command: &str,
    prepare: impl Fn(&Path),
    cleanup: impl Fn(&Path),
    metadata: bool,
) {
    let remote = &helper.scopes.remote_path;
    let baseline = helper.clone_remote_scope();
    prepare(remote);
    let node = Helper::cmd_in_with(root, command, &[("BIT_NATIVE", OsStr::new("off"))]);
    let expected = tree(remote);
    cleanup(remote);
    helper.restore_remote_scope(&baseline);
    prepare(remote);
    let unavailable = helper.scopes.e2e_dir.join("unavailable-runtime");
    let mut environment = vec![("BIT_NODE_BINARY", unavailable.as_os_str())];
    if !metadata {
        environment.push(("BIT_NODE_CLI", unavailable.as_os_str()));
    }
    let native = Helper::cmd_in_with(root, command, &environment);
    let actual = tree(remote);
    cleanup(remote);
    assert_owned(&native);
    let mixed_scope = metadata.then_some(helper.scopes.remote.as_str());
    assert_eq!(
        order::normalize(&native.stdout, mixed_scope),
        order::normalize(&node.stdout, mixed_scope),
        "{native:?}\n{node:?}",
    );
    assert_eq!(native.stderr, node.stderr, "{native:?}\n{node:?}");
    assert_eq!(native.status.code(), node.status.code(), "{native:?}\n{node:?}");
    assert_eq!(actual, expected);
}

fn assert_owned(run: &Run) {
    assert!(run.native, "{run:?}");
    assert!(!run.trace.contains("starting the JavaScript host"), "{run:?}");
}

#[derive(Debug, PartialEq, Eq)]
enum Entry {
    Directory,
    File(Vec<u8>),
    Link(PathBuf),
}

fn tree(root: &Path) -> BTreeMap<PathBuf, Entry> {
    let mut result = BTreeMap::new();
    collect(root, root, &mut result);
    result
}

fn collect(root: &Path, path: &Path, result: &mut BTreeMap<PathBuf, Entry>) {
    for entry in fs::read_dir(path).unwrap() {
        let path = entry.unwrap().path();
        let kind = fs::symlink_metadata(&path).unwrap().file_type();
        let value = if kind.is_symlink() {
            Entry::Link(fs::read_link(&path).unwrap())
        } else if kind.is_dir() {
            collect(root, &path, result);
            Entry::Directory
        } else {
            Entry::File(fs::read(&path).unwrap())
        };
        result.insert(
            path.strip_prefix(root)
                .unwrap()
                .to_path_buf(),
            value,
        );
    }
}
