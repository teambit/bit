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
    parse(&out.stdout)["versions"]
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
        .filter_map(|version| version["hash"].as_str())
        .collect();
    let mut dangling = Vec::new();
    for ver in versions {
        let Some(parents) = ver["parents"].as_array() else { continue };
        let hash = ver["hash"].as_str().unwrap();
        for p in parents.iter().filter_map(|p| p.as_str()) {
            if !hashes.contains(p) {
                dangling.push(format!("{} -> {}", &hash[..8], &p[..8]));
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

fn verify_fresh_lean_consumer(
    helper: &Helper,
    lane_scope: &str,
    lane_scope_path: &Path,
    expected_snaps: &[&str],
) {
    helper.re_init_workspace();
    helper.add_remote_scope();
    helper.add_remote_scope_with(lane_scope_path);
    helper.native_run(&format!("lane import {lane_scope}/dev -x"));
    assert!(helper.native_run("status").status.success());
    assert!(helper.native_run("checkout head -x").status.success());
    let log = parse(&helper.run_cmd("log comp1 --json"));
    let log_hashes: Vec<&str> = log
        .as_array()
        .unwrap()
        .iter()
        .filter_map(|entry| entry["hash"].as_str())
        .collect();
    for h in expected_snaps {
        assert!(log_hashes.contains(h));
    }
    assert!(
        helper
            .try_cmd(&format!("lane diff {lane_scope}/dev main"))
            .status
            .success(),
    );
    let checkout = helper.try_cmd("checkout head~3 comp1");
    let combined = format!("{}{}", checkout.stdout, checkout.stderr);
    assert!(!combined.contains("TypeError") && !combined.contains("Cannot read"));
}

#[test]
fn lane_in_scope_l_with_components_in_scope_c_main_advances_merge_main_into_lane() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    let lane_env = helper.create_new_remote_scope();
    let (lane_scope, lane_scope_path) = (lane_env.scope_name, lane_env.scope_path);
    helper.add_remote_scope_with(&lane_scope_path);
    wire_scopes(&[&helper.scopes.remote_path, &lane_scope_path]);

    helper.populate_components(1, true, "");
    helper.tag_all_without_build("");
    let main_snap1 = helper.get_head("comp1");
    helper.tag_all_without_build("--unmodified");
    let main_snap2 = helper.get_head("comp1");
    helper.tag_all_without_build("--unmodified");
    let main_snap3 = helper.get_head("comp1");
    helper.native_run("export");

    helper.native_run(&format!("lane create dev --scope {lane_scope}"));
    helper.native_run("snap --unmodified --ignore-issues *");
    let lane_snap = helper.get_head_from_lane("dev", "comp1");
    helper.native_run("export");
    let lane_ws = helper.clone_workspace();

    helper.native_run("switch main -x");
    helper.tag_all_without_build("--unmodified");
    let main_snap4 = helper.get_head("comp1");
    helper.native_run("export");

    helper.get_cloned_workspace(&lane_ws);
    helper.run_cmd("import");
    let remote = helper.scopes.remote.clone();
    helper.merge_lane("main", "--auto-merge-resolve theirs");
    let merge_snap = helper.get_head_from_lane("dev", "comp1");
    helper.native_run("export");

    assert!(scope_has_object(&lane_scope_path, &merge_snap));
    assert!(scope_has_object(&lane_scope_path, &lane_snap));
    assert!(!scope_has_object(&lane_scope_path, &main_snap1));
    assert!(!scope_has_object(&lane_scope_path, &main_snap2));
    assert!(scope_has_object(&lane_scope_path, &main_snap3));
    assert!(scope_has_object(&lane_scope_path, &main_snap4));
    for h in [&main_snap1, &main_snap2, &main_snap3, &main_snap4] {
        assert!(scope_has_object(&helper.scopes.remote_path, h));
    }
    let all = [
        merge_snap.as_str(),
        lane_snap.as_str(),
        main_snap4.as_str(),
        main_snap3.as_str(),
        main_snap2.as_str(),
        main_snap1.as_str(),
    ];
    verify_fresh_lean_consumer(&helper, &lane_scope, &lane_scope_path, &all);
    let comp_id = format!("{remote}/comp1");
    let home_vh = vh_hashes(&helper.scopes.remote_path, &comp_id);
    let lane_vh = vh_hashes(&lane_scope_path, &comp_id);
    for h in [&main_snap1, &main_snap2, &main_snap3, &main_snap4] {
        assert!(home_vh.contains(h) && lane_vh.contains(h));
    }
    assert!(lane_vh.contains(&merge_snap) && lane_vh.contains(&lane_snap));
}

#[test]
fn fork_a_lean_lane_to_a_third_scope_then_re_import_in_a_fresh_workspace() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    let (scope_c, scope_c_path) = (helper.scopes.remote.clone(), helper.scopes.remote_path.clone());
    let env_l = helper.create_new_remote_scope();
    let (scope_l, scope_l_path) = (env_l.scope_name, env_l.scope_path);
    let env_f = helper.create_new_remote_scope();
    let (scope_f, scope_f_path) = (env_f.scope_name, env_f.scope_path);
    helper.add_remote_scope_with(&scope_l_path);
    helper.add_remote_scope_with(&scope_f_path);
    wire_scopes(&[&scope_c_path, &scope_l_path, &scope_f_path]);

    helper.populate_components(2, true, "");
    helper.tag_all_without_build("");
    let main_snap_pre1 = helper.get_head("comp1");
    helper.tag_all_without_build("--unmodified");
    let main_snap_pre2 = helper.get_head("comp1");
    helper.native_run("export");

    helper.native_run(&format!("lane create original --scope {scope_l}"));
    helper.native_run("snap --unmodified --ignore-issues *");
    helper.native_run("export");

    let lane_ws = helper.clone_workspace();
    helper.native_run("switch main -x");
    helper.tag_all_without_build("--unmodified");
    let main_snap_post = helper.get_head("comp1");
    helper.native_run("export");
    helper.get_cloned_workspace(&lane_ws);
    helper.run_cmd("import");
    helper.merge_lane("main", "--auto-merge-resolve theirs");
    helper.native_run("export");

    helper.native_run(&format!("lane create forked --scope {scope_f} --fork-lane-new-scope"));
    helper.native_run("snap --unmodified --ignore-issues *");
    let snap_on_fork = helper.get_head_from_lane("forked", "comp1");
    helper.export("--fork-lane-new-scope");

    let comp_id = format!("{scope_c}/comp1");
    assert!(scope_has_object(&scope_f_path, &snap_on_fork));
    let f_vh = vh_hashes(&scope_f_path, &comp_id);
    for h in [&main_snap_pre1, &main_snap_pre2, &main_snap_post] {
        assert!(f_vh.contains(h));
    }

    helper.re_init_workspace();
    helper.add_remote_scope();
    helper.add_remote_scope_with(&scope_l_path);
    helper.add_remote_scope_with(&scope_f_path);
    assert!(
        helper
            .native_run(&format!("lane import {scope_f}/forked -x"))
            .status
            .success(),
    );
    assert!(helper.native_run("status").status.success());
    let log = parse(&helper.run_cmd("log comp1 --json"));
    assert!(
        log.as_array()
            .unwrap()
            .iter()
            .any(|entry| entry["hash"].as_str() == Some(&snap_on_fork)),
    );
    let merge_cmd = "lane merge main --auto-merge-resolve theirs --ignore-config-changes -x";
    assert!(helper.try_cmd(merge_cmd).status.success());
    assert!(dangling_parents_in(&helper.scopes.local_path, &comp_id).is_empty());
}

#[test]
fn fresh_consumer_of_a_lean_lane_create_new_lane_plus_change_scope() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    let scope_c_path = helper.scopes.remote_path.clone();
    let env_l = helper.create_new_remote_scope();
    let (scope_l, scope_l_path) = (env_l.scope_name, env_l.scope_path);
    let env_f = helper.create_new_remote_scope();
    let (scope_f, scope_f_path) = (env_f.scope_name, env_f.scope_path);
    helper.add_remote_scope_with(&scope_l_path);
    helper.add_remote_scope_with(&scope_f_path);
    wire_scopes(&[&scope_c_path, &scope_l_path, &scope_f_path]);

    helper.populate_components(1, true, "");
    helper.tag_all_without_build("");
    helper.native_run("export");
    helper.native_run(&format!("lane create lane-a --scope {scope_l}"));
    helper.native_run("snap --unmodified --ignore-issues *");
    helper.native_run("export");
    helper.native_run("switch main -x");
    helper.tag_all_without_build("--unmodified");
    helper.native_run("export");

    helper.re_init_workspace();
    helper.add_remote_scope();
    helper.add_remote_scope_with(&scope_l_path);
    helper.add_remote_scope_with(&scope_f_path);
    helper.native_run(&format!("lane import {scope_l}/lane-a -x"));
    helper.native_run("lane create forked-lane");
    helper.native_run(&format!("lane change-scope {scope_f}"));

    assert!(helper.native_run("status").status.success());
    let status = parse(&helper.native("status --json"));
    assert_eq!(
        status["stagedComponents"]
            .as_array()
            .unwrap()
            .len(),
        0,
    );
}

fn advance_main_and_merge(helper: &Helper, lane_ws: &Path) -> (String, String) {
    helper.native_run("switch main -x");
    helper.tag_all_without_build("--unmodified");
    helper.tag_all_without_build("--unmodified");
    let main_head = helper.get_head("comp1");
    helper.native_run("export");
    helper.get_cloned_workspace(lane_ws);
    helper.run_cmd("import");
    helper.merge_lane("main", "--auto-merge-resolve theirs");
    let merge_snap = helper.get_head_from_lane("dev", "comp1");
    helper.native_run("export");
    (main_head, merge_snap)
}

#[test]
fn lane_with_multiple_components_and_deep_main_history_merged_repeatedly() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    let remote = helper.scopes.remote.clone();
    let lane_env = helper.create_new_remote_scope();
    let (lane_scope, lane_scope_path) = (lane_env.scope_name, lane_env.scope_path);
    helper.add_remote_scope_with(&lane_scope_path);
    wire_scopes(&[&helper.scopes.remote_path, &lane_scope_path]);

    helper.populate_components(3, true, "");
    helper.tag_all_without_build("");
    for _ in 0..4 {
        helper.tag_all_without_build("--unmodified");
    }
    helper.native_run("export");

    helper.native_run(&format!("lane create dev --scope {lane_scope}"));
    helper.native_run("snap --unmodified --ignore-issues *");
    helper.native_run("export");
    let lane_ws = helper.clone_workspace();
    let (main_h1, merge_s1) = advance_main_and_merge(&helper, &lane_ws);
    let lane_ws2 = helper.clone_workspace();
    let (main_h2, merge_s2) = advance_main_and_merge(&helper, &lane_ws2);

    for h in [&merge_s1, &merge_s2, &main_h1, &main_h2] {
        assert!(scope_has_object(&lane_scope_path, h));
    }
    for c in ["comp1", "comp2", "comp3"] {
        assert!(vh_hashes(&helper.scopes.remote_path, &format!("{remote}/{c}")).len() >= 9);
    }

    helper.re_init_workspace();
    helper.add_remote_scope();
    helper.add_remote_scope_with(&lane_scope_path);
    helper.native_run(&format!("lane import {lane_scope}/dev -x"));
    assert!(helper.native_run("status").status.success());
    for c in ["comp1", "comp2", "comp3"] {
        let log = parse(&helper.run_cmd(&format!("log {c} --json")));
        assert!(log.as_array().unwrap().len() >= 8);
    }
    let log = parse(&helper.run_cmd("log comp1 --json"));
    let log_hashes: Vec<&str> = log
        .as_array()
        .unwrap()
        .iter()
        .filter_map(|entry| entry["hash"].as_str())
        .collect();
    assert!(log_hashes.contains(&merge_s1.as_str()) && log_hashes.contains(&merge_s2.as_str()));
}

#[test]
fn sanity_regular_lane_export_and_same_scope_merge() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    let lane_env = helper.create_new_remote_scope();
    let (lane_scope, lane_scope_path) = (lane_env.scope_name, lane_env.scope_path);
    helper.add_remote_scope_with(&lane_scope_path);
    wire_scopes(&[&helper.scopes.remote_path, &lane_scope_path]);

    helper.native_run(&format!("lane create dev --scope {lane_scope}"));
    helper.populate_components(1, true, "");
    helper.native_run("snap --ignore-issues *");
    let snap1 = helper.get_head_from_lane("dev", "comp1");
    helper.native_run("snap --unmodified --ignore-issues *");
    let snap2 = helper.get_head_from_lane("dev", "comp1");
    helper.native_run("export");
    assert!(scope_has_object(&lane_scope_path, &snap1));
    assert!(scope_has_object(&lane_scope_path, &snap2));

    let helper2 = Helper::new();
    helper2.set_workspace_with_remote_scope();
    helper2.populate_components(1, true, "");
    helper2.tag_all_without_build("");
    let main_snap = helper2.get_head("comp1");
    helper2.native_run("export");

    helper2.native_run("lane create dev");
    helper2.native_run("snap --unmodified --ignore-issues *");
    helper2.native_run("export");
    let lane_ws = helper2.clone_workspace();

    helper2.native_run("switch main -x");
    helper2.tag_all_without_build("--unmodified");
    helper2.native_run("export");

    helper2.get_cloned_workspace(&lane_ws);
    helper2.run_cmd("import");
    helper2.merge_lane("main", "--auto-merge-resolve theirs");
    let merge_snap = helper2.get_head_from_lane("dev", "comp1");
    helper2.native_run("export");

    assert!(scope_has_object(&helper2.scopes.remote_path, &merge_snap));
    assert!(scope_has_object(&helper2.scopes.remote_path, &main_snap));
    assert!(helper2.native_run("log comp1 --json").status.success());
}

fn check_lane_far_behind_main() {
    let helper2 = Helper::new();
    helper2.set_workspace_with_remote_scope();
    let lane_env2 = helper2.create_new_remote_scope();
    let (lane_scope2, lane_scope_path2) = (lane_env2.scope_name, lane_env2.scope_path);
    helper2.add_remote_scope_with(&lane_scope_path2);
    wire_scopes(&[&helper2.scopes.remote_path, &lane_scope_path2]);

    helper2.populate_components(1, true, "");
    helper2.tag_all_without_build("");
    helper2.native_run("export");
    helper2.native_run(&format!("lane create dev --scope {lane_scope2}"));
    helper2.native_run("snap --unmodified --ignore-issues *");
    helper2.native_run("export");
    let lane_ws2 = helper2.clone_workspace();

    helper2.native_run("switch main -x");
    helper2.tag_all_without_build("--unmodified");
    helper2.native_run("export");
    helper2.get_cloned_workspace(&lane_ws2);
    helper2.run_cmd("import");
    helper2.merge_lane("main", "--auto-merge-resolve theirs");
    let merge_snap = helper2.get_head_from_lane("dev", "comp1");

    let status = parse(&helper2.native("status --json"));
    let staged_entry = status["stagedComponents"]
        .as_array()
        .unwrap()
        .iter()
        .find(|i| {
            i["id"]
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

    helper2.native_run("reset --silent");
    let comp = parse(&helper2.cat_component("comp1"));
    assert!(comp["versions"].get("0.0.2").is_some() && comp["versions"].get("0.0.1").is_some());
}

#[test]
fn chained_local_forks_and_lane_far_behind_main() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    let scope_home_path = helper.scopes.remote_path.clone();
    let env_a = helper.create_new_remote_scope();
    let (scope_a, scope_a_path) = (env_a.scope_name, env_a.scope_path);
    let env_c = helper.create_new_remote_scope();
    let (scope_c, scope_c_path) = (env_c.scope_name, env_c.scope_path);
    helper.add_remote_scope_with(&scope_a_path);
    helper.add_remote_scope_with(&scope_c_path);
    wire_scopes(&[&scope_home_path, &scope_a_path, &scope_c_path]);

    helper.populate_components(1, true, "");
    helper.tag_all_without_build("");
    helper.native_run("export");
    helper.native_run(&format!("lane create lane-a --scope {scope_a}"));
    helper.native_run("snap --unmodified --ignore-issues *");
    helper.native_run("export");
    helper.native_run("lane create lane-b");
    helper.native_run("snap --unmodified --ignore-issues *");
    helper.native_run(&format!("lane create lane-c --scope {scope_c} --fork-lane-new-scope"));
    helper.native_run("snap --unmodified --ignore-issues *");
    let snap_on_lane_c = helper.get_head_from_lane("lane-c", "comp1");

    assert!(helper.try_cmd("export --fork-lane-new-scope").status.success());
    assert!(scope_has_object(&scope_c_path, &snap_on_lane_c));
    let comp_id = format!("{}/comp1", helper.scopes.remote);
    assert!(dangling_parents_in(&scope_c_path, &comp_id).is_empty());

    check_lane_far_behind_main();
}

fn check_deleted_upstream_degradation() {
    let helper3 = Helper::new();
    helper3.set_workspace_with_remote_scope();
    let (scope_c3, scope_c3_path) =
        (helper3.scopes.remote.clone(), helper3.scopes.remote_path.clone());
    let env_l3 = helper3.create_new_remote_scope();
    let (scope_l3, scope_l3_path) = (env_l3.scope_name, env_l3.scope_path);
    let env_m3 = helper3.create_new_remote_scope();
    let (scope_m3, scope_m3_path) = (env_m3.scope_name, env_m3.scope_path);
    helper3.add_remote_scope_with(&scope_l3_path);
    helper3.add_remote_scope_with(&scope_m3_path);
    wire_scopes(&[&scope_c3_path, &scope_l3_path, &scope_m3_path]);

    helper3.populate_components(1, true, "");
    helper3.tag_all_without_build("");
    helper3.native_run("export");
    helper3.native_run(&format!("lane create lane-a --scope {scope_l3}"));
    helper3.native_run("snap --unmodified --ignore-issues *");
    helper3.native_run("export");
    helper3.native_run(&format!("lane create lane-b --scope {scope_m3} --fork-lane-new-scope"));
    helper3.native_run("snap --unmodified --ignore-issues *");
    helper3.export("--fork-lane-new-scope");

    helper3.native_run(&format!("lane remove {scope_l3}/lane-a --remote --silent --force"));
    helper3.native_run("switch main -x");
    helper3.write_file("comp2/index.js", r#"console.log("comp2");"#);
    helper3.add_component("comp2", "");
    helper3.tag_all_without_build("");
    helper3.native_run("export");

    helper3.native_run("switch lane-b -x");
    helper3.native_run("snap --unmodified --ignore-issues *");
    assert!(helper3.try_cmd("export").status.success());
    let comp2_id3 = format!("{scope_c3}/comp2");
    assert!(dangling_parents_in(&scope_m3_path, &comp2_id3).is_empty());
}

#[test]
fn cross_scope_chained_lane_forks_and_deleted_upstream_degradation() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    let (scope_c, scope_c_path) = (helper.scopes.remote.clone(), helper.scopes.remote_path.clone());
    let env_l = helper.create_new_remote_scope();
    let (scope_l, scope_l_path) = (env_l.scope_name, env_l.scope_path);
    let env_m = helper.create_new_remote_scope();
    let (scope_m, scope_m_path) = (env_m.scope_name, env_m.scope_path);
    let env_n = helper.create_new_remote_scope();
    let (scope_n, scope_n_path) = (env_n.scope_name, env_n.scope_path);
    for p in [&scope_l_path, &scope_m_path, &scope_n_path] {
        helper.add_remote_scope_with(p);
    }
    wire_scopes(&[&scope_c_path, &scope_l_path, &scope_m_path, &scope_n_path]);

    helper.populate_components(1, true, "");
    helper.tag_all_without_build("");
    helper.native_run("export");
    helper.native_run(&format!("lane create lane-a --scope {scope_l}"));
    helper.native_run("snap --unmodified --ignore-issues *");
    let lane_a_snap = helper.get_head_from_lane("lane-a", "comp1");
    helper.native_run("export");
    helper.native_run(&format!("lane create lane-b --scope {scope_m} --fork-lane-new-scope"));
    helper.native_run("snap --unmodified --ignore-issues *");
    let lane_b_snap = helper.get_head_from_lane("lane-b", "comp1");
    helper.export("--fork-lane-new-scope");
    helper.native_run(&format!("lane create lane-c --scope {scope_n} --fork-lane-new-scope"));
    helper.native_run("snap --unmodified --ignore-issues *");
    let lane_c_snap = helper.get_head_from_lane("lane-c", "comp1");
    helper.export("--fork-lane-new-scope");

    let comp1_id = format!("{scope_c}/comp1");
    assert!(scope_has_object(&scope_n_path, &lane_c_snap));
    assert!(dangling_parents_in(&scope_n_path, &comp1_id).is_empty());
    let n_vh = vh_hashes(&scope_n_path, &comp1_id);
    for s in [&lane_c_snap, &lane_b_snap, &lane_a_snap] {
        assert!(n_vh.contains(s));
    }

    helper.re_init_workspace();
    helper.add_remote_scope();
    for p in [&scope_l_path, &scope_m_path, &scope_n_path] {
        helper.add_remote_scope_with(p);
    }
    helper.native_run(&format!("lane import {scope_n}/lane-c -x"));
    assert!(helper.native_run("status").status.success());
    let merge_cmd = "lane merge main --auto-merge-resolve theirs --ignore-config-changes -x";
    assert!(helper.try_cmd(merge_cmd).status.success());
    check_deleted_upstream_degradation();
}
