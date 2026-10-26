//! E2E tests for `bit ci sync: lanes whose scopes differ from this repository`.
//!
//! Ported from:
//! - `e2e/harmony/ci-sync-scopes.e2e.ts`

use super::support::{
    branch_paths_matching, branch_side_commit, branch_tip_message, branch_tip_sha, comp1_src,
    comp2_src, create_lane_with_snap, file_on_branch, git_fetch, lane_head_trailer, lane_side_edit,
    lane_tip_file, remote_branch_exists, remote_refs, set_sync_config,
    setup_components_and_initial_commit, setup_git_remote, sync_run,
};
use crate::helper::{Helper, parse};
use serde_json::json;
use std::{collections::BTreeMap, fs};

fn remote_lane_heads(helper: &Helper, lane_name: &str) -> BTreeMap<String, String> {
    let parsed =
        parse(&helper.native(&format!("lane list --remote {} --json", helper.scopes.remote)));
    let mut heads = BTreeMap::new();
    if let Some(lane) = parsed["lanes"]
        .as_array()
        .and_then(|arr| {
            arr.iter()
                .find(|entry| {
                    entry["id"]["name"].as_str() == Some(lane_name)
                        || entry["name"].as_str() == Some(lane_name)
                })
        })
        && let Some(comps) = lane["components"].as_array()
    {
        for comp in comps {
            if let (Some(id), Some(head)) = (comp["id"].as_str(), comp["head"].as_str()) {
                heads.insert(id.to_owned(), head.to_owned());
            }
        }
    }
    heads
}

#[test]
fn ci_sync_lane_spanning_two_scopes() {
    let helper = Helper::new();
    let lane = "cross-scope";
    let foreign_only_lane = "foreign-only";

    helper.set_workspace_with_remote_scope();
    let (other_scope, _) = helper.new_bare_scope_connected();
    setup_git_remote(&helper);
    set_sync_config(&helper, json!({ "lanes": ["*"] }));

    helper.output_file("comp1/index.js", &comp1_src("initial"));
    helper.add_component("comp1", "");
    helper.tag_all_without_build("");
    helper.export("");

    helper.output_file(".gitignore", "node_modules/\n.bit/\n");
    helper.git("add .");
    helper.git(r#"commit -m "initial commit""#);
    let default_branch = helper
        .git("branch --show-current")
        .trim()
        .to_owned();
    helper.git(&format!("push -u origin {default_branch}"));

    let dev_path = helper.clone_workspace();
    assert!(Helper::cmd_in(&dev_path, &format!("lane create {lane}")).status.success());
    fs::write(dev_path.join("comp1/index.js"), comp1_src("cross-scope-snap")).unwrap();
    fs::create_dir_all(dev_path.join("comp2")).unwrap();
    fs::write(dev_path.join("comp2/index.js"), comp2_src("cross-scope-snap")).unwrap();
    assert!(Helper::cmd_in(&dev_path, "add comp2").status.success());
    assert!(
        Helper::cmd_in(&dev_path, &format!("scope set {other_scope} comp2"))
            .status
            .success(),
    );
    assert!(
        Helper::cmd_in(&dev_path, r#"snap --skip-tests --message "cross-scope lane snap""#)
            .status
            .success(),
    );
    assert!(Helper::cmd_in(&dev_path, "export").status.success());

    // 1. targeted explicitly: mirrors the own-scope slice onto a branch and leaves the foreign component out
    let ids: Vec<String> = remote_lane_heads(&helper, lane).into_keys().collect();
    let joined = ids.join(" ");
    assert!(joined.contains(&format!("{other_scope}/comp2")));
    assert!(joined.contains(&format!("{}/comp1", helper.scopes.remote)));

    let (output, exit_code) = sync_run(&helper, lane);
    assert_eq!(exit_code, 0, "bit ci sync output:\n{output}");
    assert!(output.contains(&format!("{lane} -> import-lane")));
    assert!(remote_branch_exists(&helper, lane));
    assert!(file_on_branch(&helper, lane, "comp1/index.js").contains("cross-scope-snap"));
    assert!(branch_paths_matching(&helper, lane, "comp2").is_empty());
    assert!(!file_on_branch(&helper, lane, ".bitmap").contains(&other_scope));
    assert_eq!(lane_head_trailer(&helper, lane).unwrap().len(), 40);

    // 2. a lane change that touches only the foreign component leaves the mirror untouched, converged and green
    let sha_before = branch_tip_sha(&helper, lane);
    lane_side_edit(
        &dev_path,
        "comp2/index.js",
        &comp2_src("foreign-only-move"),
        "foreign-only snap",
    );
    let (output, exit_code) = sync_run(&helper, lane);
    assert_eq!(exit_code, 0, "bit ci sync output:\n{output}");
    assert!(output.contains(&format!("{lane} -> noop (converged)")));
    assert_eq!(branch_tip_sha(&helper, lane), sha_before);

    // 3. a lane change to an own component moves the mirror, still leaving the foreign component out
    lane_side_edit(&dev_path, "comp1/index.js", &comp1_src("own-move"), "own snap");
    let (output, exit_code) = sync_run(&helper, lane);
    assert_eq!(exit_code, 0, "bit ci sync output:\n{output}");
    assert!(!output.contains("skipped"));
    assert!(!output.contains("HALTED"));
    assert!(file_on_branch(&helper, lane, "comp1/index.js").contains("own-move"));
    assert!(branch_paths_matching(&helper, lane, "comp2").is_empty());
    assert!(!file_on_branch(&helper, lane, ".bitmap").contains(&other_scope));

    // 4. a dev commit on the branch exports only own components; the foreign lane entry keeps its head
    let heads_before = remote_lane_heads(&helper, lane);
    branch_side_commit(
        &helper,
        lane,
        &default_branch,
        "comp1/index.js",
        &comp1_src("branch-edit"),
        "feat: branch edit",
    );
    let (output, exit_code) = sync_run(&helper, lane);
    assert_eq!(exit_code, 0, "bit ci sync output:\n{output}");
    assert!(output.contains(&format!("{lane} -> export-branch")));
    let heads_after = remote_lane_heads(&helper, lane);
    assert_ne!(
        heads_after.get(&format!("{}/comp1", helper.scopes.remote)),
        heads_before.get(&format!("{}/comp1", helper.scopes.remote)),
    );
    assert_eq!(
        heads_after.get(&format!("{other_scope}/comp2")),
        heads_before.get(&format!("{other_scope}/comp2")),
    );
    assert!(lane_tip_file(&dev_path, "comp1/index.js").contains("branch-edit"));

    // 5. a lane with NO own-scope components, targeted explicitly: refused, nothing written
    let foreign_dev_path = helper.clone_workspace();
    assert!(
        Helper::cmd_in(&foreign_dev_path, &format!("lane create {foreign_only_lane}"))
            .status
            .success(),
    );
    fs::create_dir_all(foreign_dev_path.join("comp3")).unwrap();
    fs::write(foreign_dev_path.join("comp3/index.js"), "module.exports = () => 'comp3';\n")
        .unwrap();
    assert!(Helper::cmd_in(&foreign_dev_path, "add comp3").status.success());
    assert!(
        Helper::cmd_in(&foreign_dev_path, &format!("scope set {other_scope} comp3"))
            .status
            .success(),
    );
    assert!(
        Helper::cmd_in(
            &foreign_dev_path,
            r#"snap --skip-tests --message "foreign-only lane snap""#
        )
        .status
        .success(),
    );
    assert!(Helper::cmd_in(&foreign_dev_path, "export").status.success());

    let refs_before = remote_refs(&helper);
    let (output, exit_code) = sync_run(&helper, foreign_only_lane);
    assert_ne!(exit_code, 0, "bit ci sync output:\n{output}");
    assert!(output.contains("nothing to mirror"));
    assert!(output.contains(&format!("this repo maps scope {}", helper.scopes.remote)));
    assert!(output.contains(&format!("{other_scope}/comp3")));
    assert!(output.contains("No branch was created and nothing was written"));
    assert!(!output.contains("HALTED"));
    assert!(!output.contains("bit-sync-conflict"));
    assert!(!remote_branch_exists(&helper, foreign_only_lane));
    assert_eq!(remote_refs(&helper), refs_before);

    // 6. an --all run: the mirrored lane converges, the foreign-only one is skipped, and the run stays green
    let (output, exit_code) = sync_run(&helper, "--all");
    assert_eq!(exit_code, 0, "bit ci sync --all output:\n{output}");
    assert!(output.contains(&format!("{lane} -> noop (converged)")));
    assert!(output.contains(&format!("{foreign_only_lane} -> skipped (nothing to mirror:")));
    assert!(!output.contains("HALTED"));
    assert!(!remote_branch_exists(&helper, foreign_only_lane));
    assert!(output.contains("main ->"));

    // 7. a lane whose configured branch is the default branch: should be skipped before it is even read
    git_fetch(&helper);
    let sha_before = branch_tip_sha(&helper, &default_branch);
    set_sync_config(&helper, json!({ "lanes": ["*"], "branches": { (lane): default_branch } }));
    let (output, exit_code) = sync_run(&helper, "--all");
    assert!(output.contains(&format!("{lane} -> skipped")));
    assert!(output.contains(&format!("maps to {default_branch}")));
    assert!(output.contains(r#"the main scope is reconciled by "bit ci sync --main""#));
    assert!(!output.contains(&format!("{lane} -> skipped (nothing to mirror:")));
    assert_eq!(branch_tip_sha(&helper, &default_branch), sha_before);
    assert_eq!(exit_code, 0, "bit ci sync --all output:\n{output}");
    set_sync_config(&helper, json!({ "lanes": ["*"] }));
}

#[test]
fn ci_sync_lane_hosted_on_another_scope() {
    let helper = Helper::new();
    let lane = "hosted-elsewhere";

    helper.set_workspace_with_remote_scope();
    let (host_scope, _) = helper.new_bare_scope_connected();
    setup_git_remote(&helper);
    set_sync_config(&helper, json!({ "lanes": ["*"] }));
    let default_branch = setup_components_and_initial_commit(&helper);

    let dev_path = create_lane_with_snap(
        &helper,
        lane,
        &[("comp1/index.js", &comp1_src("hosted-elsewhere-snap"))],
        "snap on a foreign-hosted lane",
        &format!("--scope {host_scope}"),
    );

    // 1. targeted by its scope-qualified id: should mirror onto the branch its NAME maps to, id and all
    let (output, exit_code) = sync_run(&helper, &format!("{host_scope}/{lane}"));
    assert_eq!(exit_code, 0, "bit ci sync output:\n{output}");
    assert!(output.contains(&format!("{lane} -> import-lane")));
    assert!(remote_branch_exists(&helper, lane));
    assert!(!remote_branch_exists(&helper, &format!("{host_scope}/{lane}")));
    let bitmap = file_on_branch(&helper, lane, ".bitmap");
    assert!(bitmap.contains("_bit_lane"));
    assert!(bitmap.contains(&host_scope));
    let message = branch_tip_message(&helper, lane);
    assert!(message.contains(&format!("sync lane {host_scope}/{lane}")));
    assert!(message.contains("[bit-sync]"));
    assert_eq!(lane_head_trailer(&helper, lane).unwrap().len(), 40);
    let on_branch = file_on_branch(&helper, lane, "comp1/index.js");
    assert!(on_branch.contains("hosted-elsewhere-snap"));
    assert!(file_on_branch(&helper, &default_branch, "comp1/index.js").contains("comp1: initial"));
    let tip = branch_tip_sha(&helper, lane);
    let (rerun_out, rerun_code) = sync_run(&helper, &format!("{host_scope}/{lane}"));
    assert_eq!(rerun_code, 0, "bit ci sync output:\n{rerun_out}");
    assert!(rerun_out.contains(&format!("{lane} -> noop (converged)")));
    assert_eq!(branch_tip_sha(&helper, lane), tip);

    // 2. the same branch reached by NAME: should leave it alone rather than retire it
    let sha_before = branch_tip_sha(&helper, lane);
    let (output, exit_code) = sync_run(&helper, &format!("--branch {lane}"));
    assert_eq!(exit_code, 0, "bit ci sync output:\n{output}");
    assert!(output.contains(&format!("{lane} -> noop")));
    assert!(!output.contains("close-pr"));
    assert!(remote_branch_exists(&helper, lane));
    assert_eq!(branch_tip_sha(&helper, lane), sha_before);

    branch_side_commit(
        &helper,
        lane,
        &default_branch,
        "comp2/index.js",
        &comp2_src("pushed-to-branch"),
        "branch edit",
    );
    let (output, code) = sync_run(&helper, &format!("--branch {lane}"));
    assert_eq!(code, 0, "{output}");
    assert!(output.contains(&format!("{lane} -> export-branch")));
    assert!(lane_tip_file(&dev_path, "comp2/index.js").contains("pushed-to-branch"));
    helper.git(&format!("push origin origin/{lane}:refs/heads/cut-from-lane"));
    let (output, code) = sync_run(&helper, "--branch cut-from-lane");
    assert_eq!(code, 0, "{output}");
    assert!(output.contains("cut-from-lane -> noop"));
    assert!(!output.contains(&format!("{lane} ->")));
    let origin = helper
        .git("remote get-url origin")
        .trim()
        .to_owned();
    helper.git("remote set-url origin /no-such-origin");
    let (output, code) = super::support::run_bit(&helper, &format!("bit ci sync --branch {lane}"));
    helper.git(&format!("remote set-url origin {origin}"));
    assert_ne!(code, 0, "{output}");
    assert!(output.contains(&format!("HALTED {lane} ->")));

    // 3. a same-named lane in THIS scope: should halt under --dry-run and for real, leaving the owner's branch
    let sha_before = branch_tip_sha(&helper, lane);
    create_lane_with_snap(
        &helper,
        lane,
        &[("comp2/index.js", &comp2_src("rival-lane-snap"))],
        "rival lane snap",
        "--alias rival",
    );

    let refs_before_dry_run = remote_refs(&helper);
    let (dry_out, dry_code) = sync_run(&helper, &format!("{lane} --dry-run"));
    assert_ne!(dry_code, 0, "bit ci sync --dry-run output:\n{dry_out}");
    assert!(dry_out.contains(&format!(
        "HALTED {lane} -> branch {lane} mirrors lane {host_scope}/{lane}"
    )));
    assert!(dry_out.contains("Dry-run: the PR is not labelled or commented on"));
    assert_eq!(remote_refs(&helper), refs_before_dry_run);

    let (output, exit_code) = sync_run(&helper, lane);
    assert_ne!(exit_code, 0, "bit ci sync output:\n{output}");
    assert!(output.contains(&format!(
        "HALTED {lane} -> branch {lane} mirrors lane {host_scope}/{lane}"
    )));
    assert!(output.contains(&format!("refusing to plan for {}/{}", helper.scopes.remote, lane)));
    assert_eq!(branch_tip_sha(&helper, lane), sha_before);
    assert!(file_on_branch(&helper, lane, "comp1/index.js").contains("hosted-elsewhere-snap"));
    assert!(!file_on_branch(&helper, lane, "comp2/index.js").contains("rival-lane-snap"));
    helper.native(&format!(
        "lane remove {}/{lane} --remote --force --silent",
        helper.scopes.remote,
    ));
    helper.native(&format!("lane remove {host_scope}/{lane} --remote --force --silent"));
    let (output, code) = sync_run(&helper, "--all");
    assert_eq!(code, 0, "{output}");
    assert!(output.contains(&format!("{lane} -> close-pr")));
}
