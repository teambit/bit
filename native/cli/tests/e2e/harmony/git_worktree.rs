//! Cases from `e2e/harmony/git-worktree.e2e.ts`, `e2e/harmony/internalize.e2e.ts`,
//! and `e2e/harmony/relative-paths.e2e.ts`.

use crate::{
    helper::{Helper, parse},
    known_failure::KnownResult,
};
use std::{fs, process::Command};

fn init_git_workspace_with_exported_components(
    helper: &Helper,
    num_components: usize,
    git_ignore: &[&str],
) {
    helper.set_workspace_with_remote_scope();
    helper.init_new_git_repo();
    helper.populate_components(num_components, true, "");
    helper.native("tag --skip-tests");
    helper.native("export");
    helper.output_file(".gitignore", &format!("{}\n", git_ignore.join("\n")));
    helper.git("add .");
    helper.git(r#"commit -m "initial commit""#);
}

#[test]
fn git_worktree_support_workflow() -> KnownResult<()> {
    let helper = Helper::new();
    init_git_workspace_with_exported_components(&helper, 2, &["node_modules/", ".bit/"]);

    let worktree_path = helper.scopes.e2e_dir.join(format!("{}-worktree", helper.scopes.remote));
    helper.git(&format!("worktree add -b feature-branch {}", worktree_path.display()));

    let first_bit_cmd = Helper::cmd_in(
        &worktree_path,
        &format!("remote add file://{}", helper.scopes.remote_path.display()),
    );
    let first_output = format!("{}\n{}", first_bit_cmd.stdout, first_bit_cmd.stderr);

    // the worktree should have .git as a file, not a directory (sanity)
    assert!(worktree_path.join(".git").is_file());

    // the first bit command should not throw ENOTDIR
    assert!(!first_output.contains("ENOTDIR"), "{first_output}");

    // should auto-init a standalone ".bit" scope inside the worktree (never compose .git/bit)
    assert!(worktree_path.join(".bit/objects").is_dir());
    assert!(worktree_path.join(".bit/scope.json").is_file());

    // bit import and bit status in the worktree
    let import_run = Helper::cmd_in(&worktree_path, "import");
    assert!(import_run.status.success(), "{import_run:?}");
    let status_run = Helper::cmd_in(&worktree_path, "status");
    assert!(status_run.status.success(), "{status_run:?}");
    let status_output = format!("{}\n{}", status_run.stdout, status_run.stderr);

    // bit status should run successfully (no ENOTDIR crash)
    assert!(!status_output.contains("ENOTDIR"), "{status_output}");

    // bit list should show the components with their exported version
    let list_run = Helper::cmd_in(&worktree_path, "list --json");
    assert!(list_run.status.success(), "{list_run:?}");
    let list = parse(&list_run.stdout);
    let arr = list.as_array().unwrap();
    assert_eq!(arr.len(), 2);
    let comp1 = arr
        .iter()
        .find(|comp| {
            comp["id"]
                .as_str()
                .is_some_and(|id| id.contains("comp1"))
        })
        .unwrap();
    assert_eq!(comp1["currentVersion"].as_str(), Some("0.0.1"));

    // snapping in the worktree
    let main_head_before = helper.get_head("comp1");
    let link_run = Helper::cmd_in(&worktree_path, "link");
    assert!(link_run.status.success(), "{link_run:?}");
    fs::write(worktree_path.join("comp1/worktree-change.js"), r#"console.log("from worktree");"#)
        .unwrap();
    let snap_run =
        Helper::cmd_in(&worktree_path, r#"snap comp1 --skip-tests --message "snap from worktree""#);
    assert!(snap_run.status.success(), "{snap_run:?}");

    // the snap should land in the worktree scope
    let wt_comp1 = parse(&Helper::cmd_in(&worktree_path, "cat-component comp1 --json").stdout);
    let worktree_head = wt_comp1["head"].as_str().unwrap();
    assert_ne!(worktree_head, main_head_before);

    // the main workspace scope should be unaffected
    let main_head_after = helper.get_head("comp1");
    assert_eq!(main_head_after, main_head_before);

    // the main workspace status should remain clean
    helper.expect_status_to_be_clean();

    // lanes are independent per worktree
    let lane_create = Helper::cmd_in(&worktree_path, "lane create worktree-lane");
    assert!(lane_create.status.success(), "{lane_create:?}");

    // the worktree should be on the new lane
    let wt_lanes = parse(&Helper::cmd_in(&worktree_path, "lane list --json").stdout);
    assert_eq!(wt_lanes["currentLane"].as_str(), Some("worktree-lane"));

    // the main workspace should stay on main and not know the lane
    let main_lanes = parse(&helper.native("lane list --json"));
    assert_eq!(main_lanes["currentLane"].as_str(), Some("main"));
    assert!(
        !main_lanes["lanes"]
            .as_array()
            .unwrap()
            .iter()
            .filter_map(|lane| {
                lane["name"]
                    .as_str()
                    .or_else(|| lane["id"]["name"].as_str())
            })
            .any(|item| item == "worktree-lane"),
    );

    // git worktree remove cleans up the scope
    helper.git(&format!("worktree remove --force {}", worktree_path.display()));
    helper.git("worktree prune");

    // the worktree directory (including its .bit scope) should be gone
    assert!(!worktree_path.exists());
    Ok(())
}

#[test]
fn git_worktree_nested_inside_main_workspace_directory() -> KnownResult<()> {
    let helper = Helper::new();
    init_git_workspace_with_exported_components(
        &helper,
        1,
        &["node_modules/", ".bit/", "nested-wt/"],
    );

    let nested_worktree_path = helper.scopes.local_path.join("nested-wt");
    helper.git(&format!("worktree add -b nested-branch {}", nested_worktree_path.display()));
    let main_scope_objects_path = helper.scopes.local_path.join(".bit/objects");

    // bit init --reset-scope as the first command in the fresh worktree should not wipe the main scope
    let _ = Helper::cmd_in(&nested_worktree_path, "init --reset-scope");
    assert!(main_scope_objects_path.is_dir());
    assert!(
        fs::read_dir(&main_scope_objects_path)
            .unwrap()
            .next()
            .is_some(),
    );

    // bit commands in the nested worktree should use its own scope, not the main one
    let add_remote = Helper::cmd_in(
        &nested_worktree_path,
        &format!("remote add file://{}", helper.scopes.remote_path.display()),
    );
    assert!(add_remote.status.success(), "{add_remote:?}");
    let imp = Helper::cmd_in(&nested_worktree_path, "import");
    assert!(imp.status.success(), "{imp:?}");
    let st = Helper::cmd_in(&nested_worktree_path, "status");
    assert!(st.status.success(), "{st:?}");
    assert!(nested_worktree_path.join(".bit/objects").is_dir());
    assert!(main_scope_objects_path.is_dir());
    assert!(
        fs::read_dir(&main_scope_objects_path)
            .unwrap()
            .next()
            .is_some(),
    );
    Ok(())
}

#[test]
fn bit_internalize_command_workflow() -> KnownResult<()> {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(3, true, "");
    helper.native("tag --skip-tests");
    helper.run("internalize comp2");

    // bit show should show the component as internal
    let internal_data = helper.show_aspect_config("comp2", "teambit.component/internalize");
    assert_eq!(internal_data["config"]["internal"].as_bool(), Some(true));

    // the "internal" show-fragment should report isInternal true
    let frag = helper.show_component_parsed_harmony_by_title("comp2", "internal");
    assert_eq!(frag["isInternal"].as_bool(), Some(true));

    // bit status should show the component as modified
    let status = helper.status_json();
    let modified = status["modifiedComponents"].as_array().unwrap();
    assert_eq!(modified.len(), 1);
    assert!(
        modified[0]
            .as_str()
            .unwrap()
            .contains("comp2"),
    );

    // bit internalize --list should include only the internal component
    let list_json = parse(&helper.run("internalize --list --json"));
    let list_arr = list_json.as_array().unwrap();
    assert_eq!(list_arr.len(), 1);
    assert!(
        list_arr[0]
            .as_str()
            .unwrap()
            .contains("comp2"),
    );

    // the "$internal" pattern should match the internal component
    let pattern_out = helper.run("pattern '$internal'");
    assert!(pattern_out.contains("comp2"), "{pattern_out}");
    assert!(!pattern_out.contains("comp1"), "{pattern_out}");

    // tagging the component
    helper.native("tag --skip-tests");

    // the component should not be modified
    let status_after = helper.status_json();
    assert_eq!(
        status_after["modifiedComponents"]
            .as_array()
            .unwrap()
            .len(),
        0,
    );

    // .bitmap should not contain the config
    let bitmap = helper.read_bit_map();
    assert!(bitmap["comp2"].get("config").is_none());

    // bit show should still show the component as internal
    let frag_after = helper.show_component_parsed_harmony_by_title("comp2", "internal");
    assert_eq!(frag_after["isInternal"].as_bool(), Some(true));

    // exporting and importing into a new workspace
    helper.native("export");
    helper.re_init_workspace();
    helper.add_remote_scope();
    helper.import_component("comp2", "");

    // the imported (remote) component should be marked as internal
    let frag_imported = helper.show_component_parsed_harmony_by_title("comp2", "internal");
    assert_eq!(frag_imported["isInternal"].as_bool(), Some(true));

    // uninternalize a component (--revert)
    helper.set_workspace_with_remote_scope();
    helper.populate_components(2, true, "");
    helper.native("tag --skip-tests");
    helper.run("internalize comp1");
    helper.run("internalize comp1 --revert");

    // bit show should show the component as not internal
    let frag_reverted = helper.show_component_parsed_harmony_by_title("comp1", "internal");
    assert_eq!(frag_reverted["isInternal"].as_bool(), Some(false));

    // bit internalize --list should be empty
    let list_reverted = parse(&helper.run("internalize --list --json"));
    assert_eq!(list_reverted.as_array().unwrap().len(), 0);

    // reverting the internalize by "bit checkout reset"
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, true, "");
    helper.native("tag --skip-tests");
    helper.run("internalize comp1");
    helper.checkout("reset comp1");

    // should remove the internalize config
    let internal_after_reset = helper.show_aspect_config("comp1", "teambit.component/internalize");
    assert!(internal_after_reset.is_null());
    Ok(())
}

#[test]
fn relative_paths_flow_and_rewire() -> KnownResult<()> {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(2, false, "");

    // bit status should show it as an invalid component
    let status = helper.status_json();
    let issues = status["componentsWithIssues"].as_array().unwrap();
    assert_eq!(issues.len(), 1);
    assert!(
        issues[0]["id"]
            .as_str()
            .unwrap()
            .contains("comp1"),
    );

    // should block bit tag
    let tag_try = helper.try_cmd("tag");
    assert!(!tag_try.status.success());
    let tag_err = format!("{}\n{}", tag_try.stdout, tag_try.stderr);
    assert!(
        tag_err.contains(&format!(r#"index.js -> "../comp2" ({}/comp2)"#, helper.scopes.remote)),
        "{tag_err}",
    );

    // replacing relative paths by module paths
    let link_output = helper.run("link --rewire");

    // should rewire successfully
    assert!(link_output.contains("rewired 1 components and total of 1 files"), "{link_output}");

    // should not show the component as an invalid anymore
    let status_after = helper.status_json();
    assert_eq!(
        status_after["invalidComponents"]
            .as_array()
            .unwrap()
            .len(),
        0,
    );

    // tagging the component
    helper.compile();
    let tag_output = helper.native("tag --skip-tests");

    // should allow tagging the component
    assert!(tag_output.contains("2 component(s) tagged"), "{tag_output}");

    // bitmap record should have rootDir and files relative to the rootDir
    let bitmap = helper.read_bit_map();
    assert_eq!(bitmap["comp1"]["rootDir"].as_str(), Some("comp1"));
    assert_eq!(bitmap["comp1"]["mainFile"].as_str(), Some("index.js"));

    // app should work after rewiring
    let node_out = Command::new("node")
        .arg("app.js")
        .current_dir(&helper.scopes.local_path)
        .output()
        .unwrap();
    assert!(node_out.status.success());
    let app_str = String::from_utf8_lossy(&node_out.stdout);
    assert!(app_str.contains("comp1 and comp2"), "{app_str}");

    // should work after importing to another workspace
    helper.native("export");
    helper.re_init_workspace();
    helper.add_remote_scope();
    helper.import_component("*", "");

    // should write the component files with the short dirs (without rootDir)
    assert!(
        helper.scopes.local_path
            .join(&helper.scopes.remote)
            .join("comp1/index.js")
            .is_file(),
    );

    // should not generate link files
    assert!(!helper.scopes.local_path.join("components/comp1/comp2").exists());

    // app should work
    helper.output_file(
        "app.js",
        &format!("const comp1 = require('@{}/comp1');\nconsole.log(comp1())", helper.scopes.remote),
    );
    let node_out_2 = Command::new("node")
        .arg("app.js")
        .current_dir(&helper.scopes.local_path)
        .output()
        .unwrap();
    assert!(node_out_2.status.success());
    let app_str_2 = String::from_utf8_lossy(&node_out_2.stdout);
    assert!(app_str_2.contains("comp1 and comp2"), "{app_str_2}");
    Ok(())
}
