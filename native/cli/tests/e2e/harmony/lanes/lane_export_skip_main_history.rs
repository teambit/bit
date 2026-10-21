//! `e2e/harmony/lanes/lane-export-skip-main-history.e2e.ts`.

use crate::helper::{Helper, parse};
use std::{collections::HashSet, path::Path};

fn scope_has_object(scope_path: &Path, hash: &str) -> bool {
    let out = Helper::cmd_in(scope_path, &format!("cat-object {hash}"));
    out.status.success() && !out.stdout.trim().is_empty()
}

fn vh_hashes(scope_path: &Path, comp_id: &str) -> Vec<String> {
    let out = Helper::cmd_in(scope_path, &format!("cat-version-history {comp_id} --json"));
    assert!(out.status.success(), "{out:?}");
    let vh = parse(&out.stdout);
    vh["versions"]
        .as_array()
        .unwrap()
        .iter()
        .filter_map(|ver| ver["hash"].as_str().map(str::to_owned))
        .collect()
}

fn dangling_parents_in(scope_path: &Path, comp_id: &str) -> Vec<String> {
    let out = Helper::cmd_in(scope_path, &format!("cat-version-history {comp_id} --json"));
    assert!(out.status.success(), "{out:?}");
    let vh = parse(&out.stdout);
    let versions = vh["versions"].as_array().unwrap();
    let hashes: HashSet<&str> = versions
        .iter()
        .filter_map(|ver| ver["hash"].as_str())
        .collect();
    let mut dangling = Vec::new();
    for ver in versions {
        let Some(parents) = ver["parents"].as_array() else {
            continue;
        };
        let hash = ver["hash"].as_str().unwrap();
        for parent in parents {
            let parent_hash = parent.as_str().unwrap();
            if !hashes.contains(parent_hash) {
                dangling.push(format!("{} -> {}", &hash[..8], &parent_hash[..8]));
            }
        }
    }
    dangling
}

fn wire_scopes(paths: &[&Path]) {
    for (i, a) in paths.iter().enumerate() {
        for (j, b) in paths.iter().enumerate() {
            if i != j {
                Helper::add_remote_to(a, b);
            }
        }
    }
}

#[test]
fn lane_in_scope_l_with_components_in_scope_c_main_advances_merge_main_into_lane() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    let lane_env = helper.create_new_remote_scope();
    let lane_scope = lane_env.scope_name;
    let lane_scope_path = lane_env.scope_path;
    helper.add_remote_scope_with(&lane_scope_path);
    wire_scopes(&[&helper.scopes.remote_path, &lane_scope_path]);

    helper.populate_components(1, true, "");
    helper.tag_all_without_build("");
    let main_snap1 = helper.get_head("comp1");
    helper.tag_all_without_build("--unmodified");
    let main_snap2 = helper.get_head("comp1");
    helper.tag_all_without_build("--unmodified");
    let main_snap3 = helper.get_head("comp1");
    helper.export("");

    helper.create_lane("dev", &format!("--scope {lane_scope}"));
    helper.snap_all_components_without_build("--unmodified");
    let lane_snap = helper.get_head_from_lane("dev", "comp1");
    helper.export("");
    let lane_ws = helper.clone_workspace();

    helper.switch_local_lane("main", "");
    helper.tag_all_without_build("--unmodified");
    let main_snap4 = helper.get_head("comp1");
    helper.export("");

    helper.get_cloned_workspace(&lane_ws);
    helper.run_cmd("import");
    let remote = &helper.scopes.remote;
    helper.merge_lane("main", "--auto-merge-resolve theirs");
    let merge_snap = helper.get_head_from_lane("dev", "comp1");
    helper.export("");

    // 1. should contain the merge snap
    assert!(scope_has_object(&lane_scope_path, &merge_snap));
    // 2. should contain the lane-only snap
    assert!(scope_has_object(&lane_scope_path, &lane_snap));
    // 3. should NOT contain pre-lane main Version objects (the lean part stays lean)
    assert!(!scope_has_object(&lane_scope_path, &main_snap1));
    assert!(!scope_has_object(&lane_scope_path, &main_snap2));
    // 4. SHOULD contain the home-scope head Versions at each export point (one per export)
    assert!(scope_has_object(&lane_scope_path, &main_snap3));
    assert!(scope_has_object(&lane_scope_path, &main_snap4));
    // 5. what stayed on component home scope (scope-C): should still contain all main snaps
    for h in [&main_snap1, &main_snap2, &main_snap3, &main_snap4] {
        assert!(scope_has_object(&helper.scopes.remote_path, h));
    }

    // fresh consumer imports the lane
    helper.re_init_workspace();
    helper.add_remote_scope();
    helper.add_remote_scope_with(&lane_scope_path);
    helper.run_cmd(&format!("lane import {lane_scope}/dev -x"));

    // 6. bit status should not throw
    assert!(helper.try_cmd("status").status.success());
    // 7. checkout HEAD should not throw
    assert!(helper.try_cmd("checkout head").status.success());
    // 8. bit log should not throw and should show the full history including main snaps
    let log = parse(&helper.run_cmd("log comp1 --json"));
    let log_hashes: Vec<&str> = log
        .as_array()
        .unwrap()
        .iter()
        .filter_map(|entry| entry["hash"].as_str())
        .collect();
    for h in [&merge_snap, &lane_snap, &main_snap4, &main_snap3, &main_snap2, &main_snap1] {
        assert!(log_hashes.contains(&h.as_str()));
    }

    // 9. bit lane diff <lean-lane> main should not throw on a fresh consumer
    let diff = helper.try_cmd(&format!("lane diff {lane_scope}/dev main"));
    assert!(diff.status.success(), "{diff:?}");

    // 10. bit checkout HEAD~N to a main-only ancestor should not crash on a lean lane consumer
    let checkout = helper.try_cmd("checkout head~3 comp1");
    let combined = format!("{}{}", checkout.stdout, checkout.stderr);
    assert!(!combined.contains("TypeError") && !combined.contains("Cannot read"));

    // 11. VersionHistory on the component home scope should contain the full main chain
    let comp_id = format!("{remote}/comp1");
    let home_vh = vh_hashes(&helper.scopes.remote_path, &comp_id);
    for h in [&main_snap1, &main_snap2, &main_snap3, &main_snap4] {
        assert!(home_vh.contains(h));
    }

    // 12. VersionHistory on the lane scope is a closed graph (covers main + lane snaps)
    let lane_vh = vh_hashes(&lane_scope_path, &comp_id);
    for h in [&merge_snap, &lane_snap, &main_snap1, &main_snap2, &main_snap3, &main_snap4] {
        assert!(lane_vh.contains(h));
    }
}

#[test]
fn fork_a_lean_lane_to_a_third_scope_then_re_import_in_a_fresh_workspace() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    let scope_c = helper.scopes.remote.clone();
    let scope_c_path = helper.scopes.remote_path.clone();
    let env_l = helper.create_new_remote_scope();
    let scope_l = env_l.scope_name;
    let scope_l_path = env_l.scope_path;
    let env_f = helper.create_new_remote_scope();
    let scope_f = env_f.scope_name;
    let scope_f_path = env_f.scope_path;
    helper.add_remote_scope_with(&scope_l_path);
    helper.add_remote_scope_with(&scope_f_path);
    wire_scopes(&[&scope_c_path, &scope_l_path, &scope_f_path]);

    helper.populate_components(2, true, "");
    helper.tag_all_without_build("");
    let main_snap_pre1 = helper.get_head("comp1");
    helper.tag_all_without_build("--unmodified");
    let main_snap_pre2 = helper.get_head("comp1");
    helper.export("");

    helper.create_lane("original", &format!("--scope {scope_l}"));
    helper.snap_all_components_without_build("--unmodified");
    helper.export("");

    let lane_ws = helper.clone_workspace();
    helper.switch_local_lane("main", "");
    helper.tag_all_without_build("--unmodified");
    let main_snap_post = helper.get_head("comp1");
    helper.export("");
    helper.get_cloned_workspace(&lane_ws);
    helper.run_cmd("import");
    helper.merge_lane("main", "--auto-merge-resolve theirs");
    helper.export("");

    // fork the lane to scope-F and snap further
    helper.create_lane("forked", &format!("--scope {scope_f} --fork-lane-new-scope"));
    helper.snap_all_components_without_build("--unmodified");
    let snap_on_fork = helper.get_head_from_lane("forked", "comp1");
    helper.export("--fork-lane-new-scope");

    let comp_id = format!("{scope_c}/comp1");

    // 1. scope-F should hold the forked lane head (snapOnFork)
    assert!(scope_has_object(&scope_f_path, &snap_on_fork));
    // 2. scope-F's VersionHistory should be a closed graph
    let f_vh = vh_hashes(&scope_f_path, &comp_id);
    for h in [&main_snap_pre1, &main_snap_pre2, &main_snap_post] {
        assert!(f_vh.contains(h));
    }

    // 3. a fresh consumer can import the forked lane without errors
    helper.re_init_workspace();
    helper.add_remote_scope();
    helper.add_remote_scope_with(&scope_l_path);
    helper.add_remote_scope_with(&scope_f_path);
    assert!(
        helper
            .try_cmd(&format!("lane import {scope_f}/forked -x"))
            .status
            .success(),
    );

    // 4. bit status and bit log should work in the fresh consumer of the forked lane
    assert!(helper.try_cmd("status").status.success());
    let log = parse(&helper.run_cmd("log comp1 --json"));
    assert!(
        log.as_array()
            .unwrap()
            .iter()
            .filter_map(|entry| entry["hash"].as_str())
            .any(|hash| hash == snap_on_fork.as_str()),
    );

    // 5. bit lane merge main should succeed (traversal finds the common ancestor)
    assert!(
        helper
            .try_cmd("lane merge main --auto-merge-resolve theirs --ignore-config-changes -x")
            .status
            .success(),
    );

    // 6. consumer VersionHistory should be a closed graph (no dangling parent refs)
    assert!(dangling_parents_in(&helper.scopes.local_path, &comp_id).is_empty());
}

#[test]
fn fresh_consumer_of_a_lean_lane_create_new_lane_plus_change_scope() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    let scope_c_path = helper.scopes.remote_path.clone();
    let env_l = helper.create_new_remote_scope();
    let scope_l = env_l.scope_name;
    let scope_l_path = env_l.scope_path;
    let env_f = helper.create_new_remote_scope();
    let scope_f = env_f.scope_name;
    let scope_f_path = env_f.scope_path;
    helper.add_remote_scope_with(&scope_l_path);
    helper.add_remote_scope_with(&scope_f_path);
    wire_scopes(&[&scope_c_path, &scope_l_path, &scope_f_path]);

    helper.populate_components(1, true, "");
    helper.tag_all_without_build("");
    helper.export("");
    helper.create_lane("lane-a", &format!("--scope {scope_l}"));
    helper.snap_all_components_without_build("--unmodified");
    helper.export("");
    helper.switch_local_lane("main", "-x");
    helper.tag_all_without_build("--unmodified");
    helper.export("");

    helper.re_init_workspace();
    helper.add_remote_scope();
    helper.add_remote_scope_with(&scope_l_path);
    helper.add_remote_scope_with(&scope_f_path);
    helper.run_cmd(&format!("lane import {scope_l}/lane-a -x"));
    helper.create_lane("forked-lane", "");
    helper.run_cmd(&format!("lane change-scope {scope_f}"));

    // 1. bit status should not throw
    assert!(helper.try_cmd("status").status.success());

    // 2. bit status should NOT report the entire history as staged — only true local snaps
    let status = helper.status_json();
    assert_eq!(
        status["stagedComponents"]
            .as_array()
            .unwrap()
            .len(),
        0,
    );
}

#[test]
fn lane_with_multiple_components_and_deep_main_history_merged_repeatedly() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    let remote = helper.scopes.remote.clone();
    let lane_env = helper.create_new_remote_scope();
    let lane_scope = lane_env.scope_name;
    let lane_scope_path = lane_env.scope_path;
    helper.add_remote_scope_with(&lane_scope_path);
    wire_scopes(&[&helper.scopes.remote_path, &lane_scope_path]);

    helper.populate_components(3, true, "");
    helper.tag_all_without_build("");
    for _ in 0..4 {
        helper.tag_all_without_build("--unmodified");
    }
    helper.export("");

    helper.create_lane("dev", &format!("--scope {lane_scope}"));
    helper.snap_all_components_without_build("--unmodified");
    helper.export("");
    let lane_ws = helper.clone_workspace();

    helper.switch_local_lane("main", "");
    helper.tag_all_without_build("--unmodified");
    helper.tag_all_without_build("--unmodified");
    let main_head_before_first_merge = helper.get_head("comp1");
    helper.export("");
    helper.get_cloned_workspace(&lane_ws);
    helper.run_cmd("import");
    helper.merge_lane("main", "--auto-merge-resolve theirs");
    let first_merge_snap = helper.get_head_from_lane("dev", "comp1");
    helper.export("");

    let lane_ws2 = helper.clone_workspace();
    helper.switch_local_lane("main", "");
    helper.tag_all_without_build("--unmodified");
    helper.tag_all_without_build("--unmodified");
    let main_head_before_second_merge = helper.get_head("comp1");
    helper.export("");
    helper.get_cloned_workspace(&lane_ws2);
    helper.run_cmd("import");
    helper.merge_lane("main", "--auto-merge-resolve theirs");
    let second_merge_snap = helper.get_head_from_lane("dev", "comp1");
    helper.export("");

    // 1. lane scope holds both merge snaps plus the home-scope head at each export point
    assert!(scope_has_object(&lane_scope_path, &first_merge_snap));
    assert!(scope_has_object(&lane_scope_path, &second_merge_snap));
    assert!(scope_has_object(&lane_scope_path, &main_head_before_first_merge));
    assert!(scope_has_object(&lane_scope_path, &main_head_before_second_merge));

    // 2. the component home scope retains all main snaps for all components
    for c in ["comp1", "comp2", "comp3"] {
        let hashes = vh_hashes(&helper.scopes.remote_path, &format!("{remote}/{c}"));
        assert!(hashes.len() >= 9);
    }

    // fresh consumer imports the multi-merge lane
    helper.re_init_workspace();
    helper.add_remote_scope();
    helper.add_remote_scope_with(&lane_scope_path);
    helper.run_cmd(&format!("lane import {lane_scope}/dev -x"));

    // 3. bit status should not throw for any component
    assert!(helper.try_cmd("status").status.success());

    // 4. bit log should reach both merge snaps and their main history for every component
    for c in ["comp1", "comp2", "comp3"] {
        let log = parse(&helper.run_cmd(&format!("log {c} --json")));
        assert!(log.as_array().unwrap().len() >= 8);
    }

    // 5. comp1 log should contain both merge snaps explicitly
    let log = parse(&helper.run_cmd("log comp1 --json"));
    let log_hashes: Vec<&str> = log
        .as_array()
        .unwrap()
        .iter()
        .filter_map(|entry| entry["hash"].as_str())
        .collect();
    assert!(log_hashes.contains(&first_merge_snap.as_str()));
    assert!(log_hashes.contains(&second_merge_snap.as_str()));
}

#[test]
fn sanity_regular_lane_export_and_same_scope_merge() {
    // 1. sanity: regular (non-merge) lane export still includes lane-only history fully
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    let lane_env = helper.create_new_remote_scope();
    let lane_scope = lane_env.scope_name;
    let lane_scope_path = lane_env.scope_path;
    helper.add_remote_scope_with(&lane_scope_path);
    wire_scopes(&[&helper.scopes.remote_path, &lane_scope_path]);

    helper.create_lane("dev", &format!("--scope {lane_scope}"));
    helper.populate_components(1, true, "");
    helper.snap_all_components_without_build("");
    let snap1 = helper.get_head_from_lane("dev", "comp1");
    helper.snap_all_components_without_build("--unmodified");
    let snap2 = helper.get_head_from_lane("dev", "comp1");
    helper.export("");
    assert!(scope_has_object(&lane_scope_path, &snap1));
    assert!(scope_has_object(&lane_scope_path, &snap2));

    // 2. sanity: existing main-merge with no scope split still works (lane and components share scope)
    let helper2 = Helper::new();
    helper2.set_workspace_with_remote_scope();
    helper2.populate_components(1, true, "");
    helper2.tag_all_without_build("");
    let main_snap = helper2.get_head("comp1");
    helper2.export("");

    helper2.create_lane("dev", "");
    helper2.snap_all_components_without_build("--unmodified");
    helper2.export("");
    let lane_ws = helper2.clone_workspace();

    helper2.switch_local_lane("main", "");
    helper2.tag_all_without_build("--unmodified");
    helper2.export("");

    helper2.get_cloned_workspace(&lane_ws);
    helper2.run_cmd("import");
    helper2.merge_lane("main", "--auto-merge-resolve theirs");
    let merge_snap = helper2.get_head_from_lane("dev", "comp1");
    helper2.export("");

    assert!(scope_has_object(&helper2.scopes.remote_path, &merge_snap));
    assert!(scope_has_object(&helper2.scopes.remote_path, &main_snap));
    assert!(helper2.try_cmd("log comp1 --json").status.success());
}

#[test]
fn chained_local_forks_and_lane_far_behind_main() {
    // 1. chained local forks: lane-a (exported) -> lane-b (local) -> lane-c (exported)
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    let scope_home_path = helper.scopes.remote_path.clone();
    let env_a = helper.create_new_remote_scope();
    let scope_a = env_a.scope_name;
    let scope_a_path = env_a.scope_path;
    let env_c = helper.create_new_remote_scope();
    let scope_c = env_c.scope_name;
    let scope_c_path = env_c.scope_path;
    helper.add_remote_scope_with(&scope_a_path);
    helper.add_remote_scope_with(&scope_c_path);
    wire_scopes(&[&scope_home_path, &scope_a_path, &scope_c_path]);

    helper.populate_components(1, true, "");
    helper.tag_all_without_build("");
    helper.export("");

    helper.create_lane("lane-a", &format!("--scope {scope_a}"));
    helper.snap_all_components_without_build("--unmodified");
    helper.export("");

    helper.create_lane("lane-b", "");
    helper.snap_all_components_without_build("--unmodified");

    helper.create_lane("lane-c", &format!("--scope {scope_c} --fork-lane-new-scope"));
    helper.snap_all_components_without_build("--unmodified");
    let snap_on_lane_c = helper.get_head_from_lane("lane-c", "comp1");

    assert!(helper.try_cmd("export --fork-lane-new-scope").status.success());
    assert!(scope_has_object(&scope_c_path, &snap_on_lane_c));
    let comp_id = format!("{}/comp1", helper.scopes.remote);
    assert!(dangling_parents_in(&scope_c_path, &comp_id).is_empty());

    // 2. a lane far behind main, after merging main in
    let helper2 = Helper::new();
    helper2.set_workspace_with_remote_scope();
    let lane_env2 = helper2.create_new_remote_scope();
    let lane_scope2 = lane_env2.scope_name;
    let lane_scope_path2 = lane_env2.scope_path;
    helper2.add_remote_scope_with(&lane_scope_path2);
    wire_scopes(&[&helper2.scopes.remote_path, &lane_scope_path2]);

    helper2.populate_components(1, true, "");
    helper2.tag_all_without_build("");
    helper2.export("");

    helper2.create_lane("dev", &format!("--scope {lane_scope2}"));
    helper2.snap_all_components_without_build("--unmodified");
    helper2.export("");
    let lane_ws2 = helper2.clone_workspace();

    helper2.switch_local_lane("main", "");
    helper2.tag_all_without_build("--unmodified");
    helper2.export("");

    helper2.get_cloned_workspace(&lane_ws2);
    helper2.run_cmd("import");
    helper2.merge_lane("main", "--auto-merge-resolve theirs");
    let merge_snap = helper2.get_head_from_lane("dev", "comp1");

    let status = helper2.status_json();
    let staged_entry = status["stagedComponents"]
        .as_array()
        .unwrap()
        .iter()
        .find(|item| {
            item["id"]
                .as_str()
                .is_some_and(|id| id.ends_with("/comp1"))
        })
        .unwrap();
    let staged_versions: Vec<&str> = staged_entry["versions"]
        .as_array()
        .unwrap()
        .iter()
        .filter_map(|v| v.as_str())
        .collect();
    assert_eq!(staged_versions, vec![merge_snap.as_str()]);

    // running bit reset: should leave the merged-in main tag (0.0.2) intact in the component versions
    helper2.run_cmd("reset --silent");
    let comp = parse(&helper2.cat_component("comp1"));
    assert!(comp["versions"].get("0.0.2").is_some());
    assert!(comp["versions"].get("0.0.1").is_some());
}

#[test]
fn cross_scope_chained_lane_forks_and_deleted_upstream_degradation() {
    // 1. cross-scope chained lane forks: lane-A on scope-L -> lane-B on scope-M -> lane-C on scope-N
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    let scope_c = helper.scopes.remote.clone();
    let scope_c_path = helper.scopes.remote_path.clone();
    let env_l = helper.create_new_remote_scope();
    let scope_l = env_l.scope_name;
    let scope_l_path = env_l.scope_path;
    let env_m = helper.create_new_remote_scope();
    let scope_m = env_m.scope_name;
    let scope_m_path = env_m.scope_path;
    let env_n = helper.create_new_remote_scope();
    let scope_n = env_n.scope_name;
    let scope_n_path = env_n.scope_path;
    helper.add_remote_scope_with(&scope_l_path);
    helper.add_remote_scope_with(&scope_m_path);
    helper.add_remote_scope_with(&scope_n_path);
    wire_scopes(&[&scope_c_path, &scope_l_path, &scope_m_path, &scope_n_path]);

    helper.populate_components(1, true, "");
    helper.tag_all_without_build("");
    helper.export("");

    helper.create_lane("lane-a", &format!("--scope {scope_l}"));
    helper.snap_all_components_without_build("--unmodified");
    let lane_a_snap = helper.get_head_from_lane("lane-a", "comp1");
    helper.export("");

    helper.create_lane("lane-b", &format!("--scope {scope_m} --fork-lane-new-scope"));
    helper.snap_all_components_without_build("--unmodified");
    let lane_b_snap = helper.get_head_from_lane("lane-b", "comp1");
    helper.export("--fork-lane-new-scope");

    helper.create_lane("lane-c", &format!("--scope {scope_n} --fork-lane-new-scope"));
    helper.snap_all_components_without_build("--unmodified");
    let lane_c_snap = helper.get_head_from_lane("lane-c", "comp1");
    helper.export("--fork-lane-new-scope");

    let comp1_id = format!("{scope_c}/comp1");

    assert!(scope_has_object(&scope_n_path, &lane_c_snap));
    assert!(dangling_parents_in(&scope_n_path, &comp1_id).is_empty());

    let n_vh = vh_hashes(&scope_n_path, &comp1_id);
    assert!(n_vh.contains(&lane_c_snap));
    assert!(n_vh.contains(&lane_b_snap));
    assert!(n_vh.contains(&lane_a_snap));

    // fresh consumer of lane-C
    helper.re_init_workspace();
    helper.add_remote_scope();
    helper.add_remote_scope_with(&scope_l_path);
    helper.add_remote_scope_with(&scope_m_path);
    helper.add_remote_scope_with(&scope_n_path);
    helper.run_cmd(&format!("lane import {scope_n}/lane-c -x"));

    assert!(helper.try_cmd("status").status.success());
    assert!(
        helper
            .try_cmd("lane merge main --auto-merge-resolve theirs --ignore-config-changes -x")
            .status
            .success(),
    );

    // 2. forked-from lane deleted upstream — export degrades to home-scope fetch
    let helper3 = Helper::new();
    helper3.set_workspace_with_remote_scope();
    let scope_c3 = helper3.scopes.remote.clone();
    let scope_c3_path = helper3.scopes.remote_path.clone();
    let env_l3 = helper3.create_new_remote_scope();
    let scope_l3 = env_l3.scope_name;
    let scope_l3_path = env_l3.scope_path;
    let env_m3 = helper3.create_new_remote_scope();
    let scope_m3 = env_m3.scope_name;
    let scope_m3_path = env_m3.scope_path;
    helper3.add_remote_scope_with(&scope_l3_path);
    helper3.add_remote_scope_with(&scope_m3_path);
    wire_scopes(&[&scope_c3_path, &scope_l3_path, &scope_m3_path]);

    helper3.populate_components(1, true, "");
    helper3.tag_all_without_build("");
    helper3.export("");

    helper3.create_lane("lane-a", &format!("--scope {scope_l3}"));
    helper3.snap_all_components_without_build("--unmodified");
    helper3.export("");

    helper3.create_lane("lane-b", &format!("--scope {scope_m3} --fork-lane-new-scope"));
    helper3.snap_all_components_without_build("--unmodified");
    helper3.export("--fork-lane-new-scope");

    helper3.run_cmd(&format!("lane remove {scope_l3}/lane-a --remote --silent --force"));

    helper3.switch_local_lane("main", "");
    helper3.write_file("comp2/index.js", r#"console.log("comp2");"#);
    helper3.add_component("comp2", "");
    helper3.tag_all_without_build("");
    helper3.export("");

    helper3.switch_local_lane("lane-b", "");
    helper3.snap_all_components_without_build("--unmodified");

    assert!(helper3.try_cmd("export").status.success());
    let comp2_id3 = format!("{scope_c3}/comp2");
    assert!(dangling_parents_in(&scope_m3_path, &comp2_id3).is_empty());
}
