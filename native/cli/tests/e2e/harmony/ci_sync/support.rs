//! Shared fixture helpers mirroring `e2e/harmony/ci-sync-support.ts`.

use crate::helper::{Helper, config, parse, strip_ansi};
use serde_json::{Value, json};
use std::{
    fs,
    path::{Path, PathBuf},
};

pub const NO_GIT_HOST_WARNING: &str = "no git host provider is configured";

pub fn comp1_src(marker: &str) -> String {
    format!("module.exports = () => 'comp1: {marker}';\n")
}

pub fn comp2_src(marker: &str) -> String {
    format!("module.exports = () => 'comp2: {marker}';\n")
}

pub fn setup_git_remote(helper: &Helper) -> PathBuf {
    let (_, scope_path) = helper.new_bare_scope();
    let bare_repo_path = helper.scopes.e2e_dir.join(format!(
        "{}.git",
        scope_path
            .file_name()
            .unwrap()
            .to_string_lossy(),
    ));
    Helper::git_in(&helper.scopes.e2e_dir, &format!("init --bare {}", bare_repo_path.display()));
    helper.init_new_git_repo();
    helper.git(&format!("remote add origin {}", bare_repo_path.display()));
    bare_repo_path
}

pub fn setup_components_and_initial_commit(helper: &Helper) -> String {
    helper.output_file("comp1/index.js", &comp1_src("initial"));
    helper.output_file("comp2/index.js", &comp2_src("initial"));
    helper.add_component("comp1", "");
    helper.add_component("comp2", "");
    helper.tag_all_without_build("");
    helper.export("");

    helper.output_file(".gitignore", "node_modules/\n.bit/\n");
    helper.git("add .");
    helper.git(r#"commit -m "initial commit""#);
    let current_branch = helper
        .git("branch --show-current")
        .trim()
        .to_owned();
    helper.git(&format!("push -u origin {current_branch}"));
    current_branch
}

#[expect(clippy::needless_pass_by_value, reason = "callers pass inline json!() values")]
pub fn set_sync_config(helper: &Helper, sync: Value) {
    config::set_workspace_key(&helper.scopes.local_path, "teambit.git/ci", json!({ "sync": sync }));
}

pub fn setup_sync_workspace(helper: &Helper, sync: Option<Value>) -> (String, PathBuf) {
    helper.set_workspace_with_remote_scope();
    let bare_repo_path = setup_git_remote(helper);
    if let Some(sync) = sync {
        set_sync_config(helper, sync);
    }
    (setup_components_and_initial_commit(helper), bare_repo_path)
}

pub fn create_lane_with_snap(
    helper: &Helper,
    lane: &str,
    files: &[(&str, &str)],
    message: &str,
    lane_args: &str,
) -> PathBuf {
    let dev_path = helper.clone_workspace();
    let create_cmd = format!("lane create {lane} {lane_args}");
    let res = Helper::cmd_in(&dev_path, create_cmd.trim());
    assert!(res.status.success(), "{res:?}");
    for (file_path, content) in files {
        let full = dev_path.join(file_path);
        fs::create_dir_all(full.parent().unwrap()).unwrap();
        fs::write(full, content).unwrap();
    }
    let snap = Helper::cmd_in(&dev_path, &format!(r#"snap --skip-tests --message "{message}""#));
    assert!(snap.status.success(), "{snap:?}");
    let exp = Helper::cmd_in(&dev_path, "export");
    assert!(exp.status.success(), "{exp:?}");
    dev_path
}

pub fn run_bit(helper: &Helper, cmd: &str) -> (String, i32) {
    run_bit_in(&helper.scopes.local_path, cmd)
}

pub fn run_bit_in(cwd: &Path, cmd: &str) -> (String, i32) {
    let args = cmd.strip_prefix("bit ").unwrap_or(cmd);
    let res = Helper::cmd_in(cwd, args);
    let combined = format!("{}\n{}", res.stdout, res.stderr);
    (strip_ansi(&combined), res.status.code().unwrap_or(-1))
}

pub fn git_fetch(helper: &Helper) {
    helper.git("fetch origin --prune");
}

pub fn sync_run(helper: &Helper, args: &str) -> (String, i32) {
    let res = run_bit(helper, &format!("ci sync {args}"));
    git_fetch(helper);
    res
}

pub fn seed_sync(helper: &Helper, args: &str) {
    let (output, code) = sync_run(helper, args);
    assert_eq!(code, 0, "setup run 'bit ci sync {args}' failed:\n{output}");
}

pub fn remote_branch_exists(helper: &Helper, branch: &str) -> bool {
    !helper
        .git(&format!("ls-remote --heads origin {branch}"))
        .trim()
        .is_empty()
}

pub fn remote_refs(helper: &Helper) -> String {
    helper
        .git("ls-remote origin")
        .trim()
        .to_owned()
}

pub fn branch_tip_sha(helper: &Helper, branch: &str) -> String {
    helper
        .git(&format!("rev-parse origin/{branch}"))
        .trim()
        .to_owned()
}

pub fn branch_tip_message(helper: &Helper, branch: &str) -> String {
    helper.git(&format!("log origin/{branch} -1 --format=%B"))
}

pub fn lane_head_trailer(helper: &Helper, branch: &str) -> Option<String> {
    branch_tip_message(helper, branch)
        .lines()
        .find_map(|line| {
            line.strip_prefix("Bit-Lane-Head:")
                .map(|rest| rest.trim().to_owned())
                .filter(|sha| !sha.is_empty())
        })
}

pub fn file_on_branch(helper: &Helper, branch: &str, file_path: &str) -> String {
    helper.git(&format!("show origin/{branch}:{file_path}"))
}

pub fn branch_paths_matching(helper: &Helper, branch: &str, needle: &str) -> Vec<String> {
    helper
        .git(&format!("ls-tree -r --name-only origin/{branch}"))
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty() && line.contains(needle))
        .map(str::to_owned)
        .collect()
}

pub fn remote_lane_fingerprint(helper: &Helper, lane_name: &str) -> String {
    let parsed =
        parse(&helper.native(&format!("lane list --remote {} --json", helper.scopes.remote)));
    let lane = parsed["lanes"]
        .as_array()
        .and_then(|arr| {
            arr.iter()
                .find(|entry| {
                    entry["id"]["name"].as_str() == Some(lane_name)
                        || entry["name"].as_str() == Some(lane_name)
                })
        });
    lane.map_or_else(
        || "LANE-MISSING".to_owned(),
        |entry| serde_json::to_string(&entry["components"]).unwrap(),
    )
}

pub fn lane_tip_file(dev_path: &Path, file_path: &str) -> String {
    let fetched = Helper::cmd_in(dev_path, "fetch --lanes");
    assert!(fetched.status.success(), "{fetched:?}");
    let checked = Helper::cmd_in(dev_path, "checkout head -x");
    assert!(checked.status.success(), "{checked:?}");
    fs::read_to_string(dev_path.join(file_path)).unwrap()
}

pub fn lane_side_edit(dev_path: &Path, file_path: &str, content: &str, message: &str) {
    let fetched = Helper::cmd_in(dev_path, "fetch --lanes");
    assert!(fetched.status.success(), "{fetched:?}");
    let checked = Helper::cmd_in(dev_path, "checkout head -x");
    assert!(checked.status.success(), "{checked:?}");
    let full = dev_path.join(file_path);
    fs::create_dir_all(full.parent().unwrap()).unwrap();
    fs::write(full, content).unwrap();
    let snapped = Helper::cmd_in(dev_path, &format!(r#"snap --skip-tests --message "{message}""#));
    assert!(snapped.status.success(), "{snapped:?}");
    let exported = Helper::cmd_in(dev_path, "export");
    assert!(exported.status.success(), "{exported:?}");
}

pub fn branch_side_commit(
    helper: &Helper,
    branch: &str,
    default_branch: &str,
    file_path: &str,
    content: &str,
    message: &str,
) -> String {
    git_fetch(helper);
    helper.git(&format!("checkout -f -B {branch} origin/{branch}"));
    helper.output_file(file_path, content);
    helper.git("add -A");
    helper.git(&format!(r#"commit -m "{message}""#));
    helper.git(&format!("push origin {branch}"));
    let sha = helper
        .git("rev-parse HEAD")
        .trim()
        .to_owned();
    helper.git(&format!("checkout -f {default_branch}"));
    sha
}

pub fn make_local_scope_cold(helper: &Helper) {
    let ws = &helper.scopes.local_path;
    let _ = fs::remove_dir_all(ws.join(".bit"));
    let _ = fs::remove_dir_all(ws.join(".git/bit"));
    helper.run("init");
    helper.add_remote_scope();
}

pub fn scope_object_count(helper: &Helper) -> usize {
    let candidates = [
        helper.scopes.local_path.join(".bit/objects"),
        helper.scopes.local_path.join(".git/bit/objects"),
    ];
    let Some(root) = candidates.into_iter().find(|d| d.exists()) else {
        return 0;
    };
    fn walk(dir: &Path) -> usize {
        let mut count = 0;
        if let Ok(entries) = fs::read_dir(dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_dir() {
                    count += walk(&path);
                } else {
                    count += 1;
                }
            }
        }
        count
    }
    walk(&root)
}

#[cfg(unix)]
pub fn arm_pre_push_hook(helper: &Helper, script: &str) -> PathBuf {
    use std::os::unix::fs::PermissionsExt;
    let hook_path = helper.scopes.local_path.join(".git/hooks/pre-push");
    fs::create_dir_all(hook_path.parent().unwrap()).unwrap();
    helper.git("config core.hooksPath .git/hooks");
    fs::write(&hook_path, format!("#!/bin/sh\n{script}\nexit 0\n")).unwrap();
    fs::set_permissions(&hook_path, fs::Permissions::from_mode(0o755)).unwrap();
    hook_path
}

#[cfg(not(unix))]
pub fn arm_pre_push_hook(helper: &Helper, script: &str) -> PathBuf {
    let hook_path = helper.scopes.local_path.join(".git/hooks/pre-push");
    fs::create_dir_all(hook_path.parent().unwrap()).unwrap();
    helper.git("config core.hooksPath .git/hooks");
    fs::write(&hook_path, format!("#!/bin/sh\n{script}\nexit 0\n")).unwrap();
    hook_path
}

pub fn disarm_pre_push_hook(helper: &Helper, hook_path: &Path) {
    let _ = fs::remove_file(hook_path);
    let _ = std::process::Command::new("git")
        .args(["config", "--unset", "core.hooksPath"])
        .current_dir(&helper.scopes.local_path)
        .output();
}
