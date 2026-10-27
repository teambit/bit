//! Bare-scope collection is compared at the same path, including every object and backup byte.
mod boundaries;
#[cfg(target_os = "linux")]
mod cross_device;
mod objects;
mod restore;
mod workspace;
use crate::{
    commands::move_paths::support::{self, tree},
    helper::{Helper, Run},
};
use flate2::{Compression, write::ZlibEncoder};
use sha1::{Digest, Sha1};
use std::{ffi::OsStr, fs, io::Write, path::Path};

fn fixture() -> Helper {
    let helper = support::workspace(1, true);
    support::setup(&helper, "export");
    helper.output_file("comp1/index.js", "module.exports=()=> 'second';\n");
    support::tag(&helper);
    support::setup(&helper, "export");
    helper
}
fn compare(helper: &Helper, command: &str, color: bool) -> Run {
    compare_with_cleanup(helper, command, color, |_| {}, |_| {})
}
fn compare_with_cleanup(
    helper: &Helper,
    command: &str,
    color: bool,
    prepare: impl Fn(&Path),
    cleanup: impl Fn(&Path),
) -> Run {
    compare_with_snapshot(helper, command, color, prepare, cleanup, tree)
}
fn compare_with_snapshot(
    helper: &Helper,
    command: &str,
    color: bool,
    prepare: impl Fn(&Path),
    cleanup: impl Fn(&Path),
    observe: impl Fn(&Path) -> std::collections::BTreeMap<String, Vec<u8>>,
) -> Run {
    let scope = &helper.scopes.remote_path;
    let baseline = helper.clone_remote_scope();
    let environment = [("FORCE_COLOR", OsStr::new(if color { "1" } else { "0" }))];
    let mut oracle = environment.to_vec();
    oracle.push(("BIT_NATIVE", OsStr::new("off")));
    prepare(scope);
    let node = Helper::cmd_in_with(scope, command, &oracle);
    let expected = observe(scope);
    cleanup(scope);
    helper.restore_remote_scope(&baseline);
    prepare(scope);
    let unavailable = helper.scopes.e2e_dir.join("unavailable-runtime");
    let mut native = environment.to_vec();
    native.extend([
        ("BIT_NODE_BINARY", unavailable.as_os_str()),
        ("BIT_NODE_CLI", unavailable.as_os_str()),
    ]);
    let actual = Helper::cmd_in_with(scope, command, &native);
    let actual_tree = observe(scope);
    cleanup(scope);
    assert!(actual.native, "{actual:?}");
    assert!(!actual.trace.contains("starting the JavaScript host"), "{actual:?}");
    assert_eq!(actual.status.code(), node.status.code(), "{actual:?}\n{node:?}");
    assert_eq!(actual.stdout, node.stdout, "{actual:?}\n{node:?}");
    assert_eq!(actual.stderr, node.stderr, "{actual:?}\n{node:?}");
    let differences: std::collections::BTreeSet<_> = actual_tree
        .keys()
        .chain(expected.keys())
        .filter(|key| actual_tree.get(*key) != expected.get(*key))
        .collect();
    assert!(differences.is_empty(), "{command}: changed scope entries: {differences:?}");
    actual
}
fn orphan(scope: &Path) -> String {
    let bytes = b"unreachable binary\0source\xff";
    let hash = format!("{:x}", Sha1::digest(bytes));
    let mut encoder = ZlibEncoder::new(Vec::new(), Compression::default());
    write!(encoder, "Source {hash} {}\0", bytes.len()).unwrap();
    encoder.write_all(bytes).unwrap();
    let path = scope
        .join("objects")
        .join(&hash[..2])
        .join(&hash[2..]);
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(path, encoder.finish().unwrap()).unwrap();
    hash
}
#[test]
fn bare_collection_keeps_exported_ancestry_and_moves_unreachable_objects_without_node() {
    let helper = fixture();
    let scope = &helper.scopes.remote_path;
    let hash = orphan(scope);
    let baseline = helper.clone_remote_scope();
    for command in
        ["gc --dry-run", "gc --dry-run --json", "gc --backup", "gc --json", "gc --keep-versions 0"]
    {
        helper.restore_remote_scope(&baseline);
        let run = compare(&helper, command, false);
        assert!(run.status.success(), "{run:?}");
        let directory = if command.contains("--dry-run") { "objects" } else { "deleted-objects" };
        assert!(
            scope
                .join(directory)
                .join(&hash[..2])
                .join(&hash[2..])
                .is_file(),
        );
    }
    let restored = compare(&helper, "gc --restore", false);
    assert!(restored.status.success(), "{restored:?}");
    assert!(!scope.join("deleted-objects").exists());
}
#[test]
fn bare_collection_preserves_live_lane_history_in_color() {
    let helper = fixture();
    support::setup(&helper, "lane create feature");
    helper.output_file("comp1/index.js", "module.exports=()=> 'lane';\n");
    support::setup(&helper, "snap --skip-tests");
    support::setup(&helper, "export");
    orphan(&helper.scopes.remote_path);
    let run = compare(&helper, "gc", true);
    assert!(run.status.success(), "{run:?}");
}

#[test]
fn bare_collection_retains_foreign_hidden_lane_heads_and_trashed_lane_roots() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    let (origin, _) = helper.new_bare_scope_connected();
    helper.populate_components(2, false, "");
    support::setup(&helper, &format!("scope set {origin} comp2"));
    support::setup(&helper, "link --rewire");
    support::setup(&helper, "compile");
    support::setup(&helper, "tag --skip-tests");
    support::setup(&helper, "export");
    support::setup(&helper, "lane create feature");
    support::setup(&helper, "snap comp1 --skip-auto-snap --unmodified --skip-tests");
    support::setup(&helper, "export");
    helper.seed_hidden_update_dependent(
        &format!("{origin}/comp2"),
        &format!("{}/feature", helper.scopes.remote),
    );
    orphan(&helper.scopes.remote_path);
    let baseline = helper.clone_remote_scope();
    let run = compare(&helper, "gc", false);
    assert!(run.status.success(), "{run:?}");
    helper.restore_remote_scope(&baseline);
    support::setup(
        &helper,
        &format!("lane remove {}/feature --remote --silent --force", helper.scopes.remote),
    );
    let run = compare(&helper, "gc", false);
    assert!(run.status.success(), "{run:?}");
}

#[test]
fn bare_collection_owns_backup_write_failures_without_replay() {
    let helper = fixture();
    orphan(&helper.scopes.remote_path);
    fs::write(helper.scopes.remote_path.join("deleted-objects"), "not a directory\n").unwrap();
    for (command, color) in [("gc", false), ("gc", true), ("gc --json", false), ("gc --json", true)]
    {
        let run = compare(&helper, command, color);
        assert!(!run.status.success(), "{run:?}");
    }
}

#[test]
fn bare_collection_keeps_only_the_requested_flattened_dependency_version() {
    let helper = fixture();
    let (deleted, kept) = objects::dependency_graph(&helper);
    let run = compare(&helper, "gc", false);
    assert!(run.status.success(), "{run:?}");
    for hash in kept {
        assert!(objects::path(&helper.scopes.remote_path, "objects", &hash).is_file());
    }
    for hash in deleted {
        assert!(!objects::path(&helper.scopes.remote_path, "objects", &hash).exists());
        assert!(objects::path(&helper.scopes.remote_path, "deleted-objects", &hash).is_file());
    }
}

#[test]
fn bare_collection_does_not_replay_successful_moves_when_another_batch_member_fails() {
    use std::os::unix::fs::PermissionsExt;
    let helper = fixture();
    let blocked = orphan(&helper.scopes.remote_path);
    let movable = "f".repeat(40);
    objects::write(&helper.scopes.remote_path, "Source", &movable, b"another unreachable object");
    let bucket = helper.scopes.remote_path
        .join("objects")
        .join(&blocked[..2]);
    assert!(bucket.is_dir());
    let run = compare_with_cleanup(
        &helper,
        "gc",
        false,
        |scope| {
            fs::set_permissions(
                scope
                    .join("objects")
                    .join(&blocked[..2]),
                fs::Permissions::from_mode(0o555),
            )
            .unwrap();
        },
        |scope| {
            fs::set_permissions(
                scope
                    .join("objects")
                    .join(&blocked[..2]),
                fs::Permissions::from_mode(0o755),
            )
            .unwrap();
        },
    );
    assert!(!run.status.success(), "{run:?}");
    assert!(objects::path(&helper.scopes.remote_path, "objects", &blocked).exists());
    assert!(!objects::path(&helper.scopes.remote_path, "objects", &movable).exists());
    assert!(objects::path(&helper.scopes.remote_path, "deleted-objects", &movable).is_file());
}

#[test]
fn bare_collection_rebuilds_local_lane_index_without_inventing_a_scope_field() {
    let helper = fixture();
    let scope = &helper.scopes.remote_path;
    let hash = "e".repeat(40);
    let value = serde_json::json!({"name":"local-lane","components":[],"log":{"username":"CI","email":"ci@example.test"}});
    objects::write(scope, "Lane", &hash, &serde_json::to_vec(&value).unwrap());
    fs::remove_file(scope.join("index.json")).unwrap();
    let run = compare(&helper, "gc --dry-run", false);
    assert!(run.status.success(), "{run:?}");
}

#[test]
fn bare_collection_uses_scope_metadata_identity_instead_of_its_storage_filename() {
    let helper = fixture();
    let scope = &helper.scopes.remote_path;
    let hash = objects::digest(&helper.scopes.remote);
    let misplaced = "3".repeat(40);
    let body = serde_json::to_vec(
        &serde_json::json!({"name":helper.scopes.remote,"license":"fixture-license"}),
    )
    .unwrap();
    objects::write(scope, "ScopeMeta", &hash, &body);
    objects::write(scope, "ScopeMeta", &misplaced, &body);
    let run = compare(&helper, "gc", false);
    assert!(run.status.success(), "{run:?}");
    assert!(objects::path(scope, "objects", &hash).is_file());
    assert!(objects::path(scope, "deleted-objects", &misplaced).is_file());
}

#[test]
fn bare_collection_follows_legacy_component_aliases_for_flattened_dependencies() {
    for boxed in [false, true] {
        let helper = fixture();
        let scope = &helper.scopes.remote_path;
        let (deleted, kept) = objects::alias_graph(&helper, boxed);
        let run = compare(&helper, "gc", false);
        assert!(run.status.success(), "{run:?}");
        for hash in kept {
            assert!(objects::path(scope, "objects", &hash).is_file());
        }
        for hash in deleted {
            assert!(objects::path(scope, "deleted-objects", &hash).is_file());
        }
    }
}
