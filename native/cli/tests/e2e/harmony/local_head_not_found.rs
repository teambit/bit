//! `e2e/harmony/local-head-not-found.e2e.ts`.

use crate::helper::{Helper, parse};
use sha1::{Digest, Sha1};

fn object_rel_path(hash: &str) -> String {
    format!(".bit/objects/{}/{}", &hash[..2], &hash[2..])
}

fn sha1_hex(input: &str) -> String {
    let mut hasher = Sha1::new();
    hasher.update(input.as_bytes());
    format!("{:x}", hasher.finalize())
}

/// - `local head Version object is missing from scope › head ref points to a missing snap while bitmap is pinned to a valid older version › bit status should surface LocalHeadNotFound with actionable "bit import --objects" instead of the raw graph error`
/// - `local head Version object is missing from scope › head ref points to a missing snap while bitmap is pinned to a valid older version › bit checkout head should fail early with LocalHeadNotFound (not a later ComponentNotFound) and suggest "bit import --objects"`
/// - `local head Version object is missing from scope › the head Version object is missing locally while the remote has it › should fetch the missing Version object rather than fail`
/// - `local head Version object is missing from scope › the head Version object is missing locally while the remote has it › should write the fetched Version object to the local scope`
/// - `local head Version object is missing from scope › the head Version object is missing locally while the remote has it › and the remote head has moved on since › should load the version it fetched rather than fail on the newer head`
/// - `local head Version object is missing from scope › bit envs with a component on a core env › should not fetch the core env component into the local scope, it ships with bit`
#[test]
fn local_head_version_object_missing_from_scope() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, false, "");
    helper.native("tag --skip-tests");
    helper.native("export");

    helper.populate_components(1, false, "v2");
    helper.native("snap --skip-tests");
    let remote = helper.scopes.remote.clone();
    let comp_after_snap = parse(&helper.native(&format!("cat-component {remote}/comp1 --json")));
    let head_hash = comp_after_snap["head"]
        .as_str()
        .unwrap()
        .to_owned();

    helper.native("checkout 0.0.1 comp1 -x");

    helper.delete_path(&object_rel_path(&head_hash));
    let vh_hash = sha1_hex(&format!("{remote}/comp1:VersionHistory"));
    helper.delete_path(&object_rel_path(&vh_hash));

    let status_run = helper.cmd("status");
    let combined_status = format!("{}\n{}", status_run.stdout, status_run.stderr);
    assert!(!combined_status.contains("does not exist on graph"), "{combined_status}");
    assert!(combined_status.contains("--objects"), "{combined_status}");

    let checkout_run = helper.cmd("checkout head");
    let combined_checkout = format!("{}\n{}", checkout_run.stdout, checkout_run.stderr);
    assert!(!combined_checkout.contains("does not exist on graph"), "{combined_checkout}");
    assert!(!combined_checkout.contains("ComponentNotFound"), "{combined_checkout}");
    assert!(combined_checkout.contains("--objects"), "{combined_checkout}");

    // Core env is not fetched into the local scope
    helper.re_init_workspace();
    helper.populate_components(1, false, "");
    let cat_core = helper.cmd("cat-component teambit.harmony/node");
    assert_ne!(cat_core.status.code(), Some(0));
}
