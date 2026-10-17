//! Status command options and workspace configuration precedence.

use crate::helper::{Helper, parse};
use std::{ffi::OsStr, fs};

fn compare(helper: &Helper, command: &str, environment: &[(&str, &OsStr)]) {
    let copy = helper.clone_workspace();
    let native = Helper::cmd_in_with(&helper.scopes.local_path, command, environment);
    assert!(native.native, "{}", native.trace);
    let temporary_exists = helper.scopes.local_path.join(".bitTmp").exists();
    helper.get_cloned_workspace(&copy);
    let mut node_environment = environment.to_vec();
    node_environment.push(("BIT_NATIVE", OsStr::new("off")));
    let node = Helper::cmd_in_with(&helper.scopes.local_path, command, &node_environment);
    assert_eq!(
        temporary_exists,
        helper.scopes.local_path.join(".bitTmp").exists(),
        "{command}: temporary cleanup",
    );
    assert_eq!(native.status.code(), node.status.code(), "{command}");
    assert_eq!(native.stderr, node.stderr, "{command}");
    if command.contains("--json") {
        assert_eq!(parse(&native.stdout), parse(&node.stdout), "{command}");
    } else {
        assert_eq!(native.stdout, node.stdout, "{command}");
    }
}

#[test]
fn circular_dependency_flags_match_node() {
    let helper = Helper::new();
    helper.re_init_workspace_with(false);
    helper.populate_components(2, true, "");
    helper.output_file("comp2/index.js", "module.exports = require('@my-scope/comp1');");
    for command in [
        "status --json",
        "status --json -c",
        "status -c --strict",
        "status --ignore-circular-dependencies --warnings",
        "status --json -l -c",
    ] {
        compare(&helper, command, &[]);
    }
}

#[test]
fn global_aspect_settings_merge_before_workspace_settings() {
    let helper = Helper::new();
    helper.re_init_workspace_with(false);
    helper.create_component_bar_foo("module.exports = 'hello';");
    helper.add_component_bar_foo();
    let home = helper.scopes.local_path.join(".test-home");
    fs::create_dir_all(&home).unwrap();
    fs::write(home.join(".bitrc.jsonc"), r#"{
        "teambit.component/issues": { "ignoreIssues": ["MissingDists", "MissingLinksFromNodeModulesToSrc"] },
        "teambit.dependencies/dependency-resolver": { "savePrefix": "~" }
    }"#).unwrap();
    let environment = [("HOME", home.as_os_str()), ("USERPROFILE", home.as_os_str())];
    for command in ["status --json", "status --warnings", "status --quick --json"] {
        compare(&helper, command, &environment);
    }
}

#[test]
fn embedded_git_scope_status_and_diff_match_node() {
    let helper = Helper::new();
    helper.re_init_workspace_with(false);
    helper.populate_components(1, true, "");
    helper.tag_without_build("comp1", "");
    helper.append_file("comp1/index.js", "\n// changed");
    let root = &helper.scopes.local_path;
    fs::create_dir(root.join(".git")).unwrap();
    fs::rename(root.join(".bit"), root.join(".git/bit")).unwrap();
    for command in
        ["status --json", "status --warnings", "status --quick --json", "diff comp1 --json"]
    {
        compare(&helper, command, &[]);
    }
    assert!(!root.join(".bit").exists());
}

#[test]
fn dependencies_outside_the_bitmap_use_the_saved_graph() {
    let helper = Helper::new();
    helper.re_init_workspace_with(false);
    helper.populate_components(2, true, "");
    helper.tag_without_build("", "");
    let path = helper.scopes.local_path.join(".bitmap");
    let mut bitmap = crate::helper::config::read_jsonc(&path);
    bitmap
        .as_object_mut()
        .unwrap()
        .retain(|_, row| row["name"] != "comp2");
    crate::helper::config::write_json(&path, &bitmap, b"    ");
    for command in ["status --json", "status --warnings"] {
        compare(&helper, command, &[]);
    }
}

#[test]
fn deprecated_dependencies_are_reported_and_self_deprecation_suppresses_them() {
    let helper = Helper::new();
    helper.re_init_workspace_with(false);
    helper.populate_components(2, true, "");
    helper.tag_without_build("", "");
    helper.run("deprecate comp2");
    for command in ["status --json", "status --warnings", "diff comp2 --json"] {
        compare(&helper, command, &[]);
    }
    helper.run("deprecate comp1");
    compare(&helper, "status --json", &[]);
}

fn merge_workspace() -> Helper {
    merge_workspace_with(crate::helper::remote::publish)
}

fn merge_workspace_with(publish: fn(&Helper)) -> Helper {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.create_component_bar_foo("module.exports = 'base';");
    helper.add_component_bar_foo();
    helper.tag_without_build("", "");
    publish(&helper);
    helper.run("lane create dev");
    helper.output_file("bar/foo.js", "module.exports = 'lane';");
    helper.run("snap --message lane");
    publish(&helper);
    helper.run("switch main -x");
    helper.output_file("bar/foo.js", "module.exports = 'main';");
    helper.tag_without_build("", "");
    publish(&helper);
    helper.run("lane merge dev --manual --no-snap -x");
    helper
}

#[test]
fn unresolved_lane_merge_state_matches_node_status_and_diff() {
    let helper = merge_workspace();
    for command in ["status --json", "status --warnings", "diff bar/foo --json"] {
        compare(&helper, command, &[]);
    }
}

#[test]
fn resolved_pending_lane_merge_state_matches_node_status_and_diff() {
    let helper = merge_workspace();
    helper.output_file("bar/foo.js", "module.exports = 'resolved';");
    for command in ["status --json", "status --warnings", "diff bar/foo --json"] {
        compare(&helper, command, &[]);
    }
}

#[test]
fn untracked_dependency_color_output_matches_node() {
    let helper = Helper::new();
    helper.re_init_workspace_with(false);
    helper.create_component_bar_foo("module.exports = require('../shared');");
    helper.add_component_bar_foo();
    helper.output_file("shared.js", "module.exports = 'untracked';");
    for command in ["status --json", "status --warnings"] {
        compare(&helper, command, &[]);
    }
    for json in [false, true] {
        let baseline = helper.clone_workspace();
        let node = colored_status(&baseline, json, true);
        let native = colored_status(&helper.scopes.local_path, json, false);
        assert_eq!(native.status.code(), node.status.code());
        assert_eq!(native.stdout, node.stdout);
        let stderr = String::from_utf8_lossy(&native.stderr);
        assert!(!stderr.contains("delegating"), "{stderr}");
        let visible = stderr
            .lines()
            .filter(|line| !line.starts_with("bit-native: "))
            .collect::<Vec<_>>()
            .join("\n");
        let node_stderr = String::from_utf8_lossy(&node.stderr);
        let expected = node_stderr
            .lines()
            .filter(|line| !line.starts_with("bit-native: "))
            .collect::<Vec<_>>()
            .join("\n");
        assert_eq!(visible, expected);
    }
}

fn colored_status(root: &std::path::Path, json: bool, node: bool) -> std::process::Output {
    let mut command = crate::helper::setup::bit_command(crate::helper::setup::shared(), root);
    command.args(["status", if json { "--json" } else { "--warnings" }]);
    command
        .env_remove("NO_COLOR")
        .env("FORCE_COLOR", "1")
        .env("BIT_NATIVE", if node { "off" } else { "on" })
        .output()
        .unwrap()
}

#[test]
fn binary_file_changes_match_node_status_and_diff() {
    let helper = Helper::new();
    helper.re_init_workspace_with(false);
    helper.create_component_bar_foo("module.exports = 'binary asset';");
    let path = helper.scopes.local_path.join("bar/image.bin");
    fs::write(&path, [0, 255, 192, 128, 1]).unwrap();
    helper.run("add bar -i bar/foo -m foo.js");
    helper.tag_without_build("", "");
    fs::write(path, [0, 255, 192, 128, 2]).unwrap();
    compare(&helper, "status --json", &[]);
    compare(&helper, "diff bar/foo --json", &[]);
}

#[test]
fn tailored_locale_uses_intl_order_without_delegating_status() {
    let helper = Helper::new();
    helper.re_init_workspace_with(false);
    for name in ["charlie", "hotel"] {
        helper.output_file(&format!("{name}/index.js"), "module.exports = 'locale';");
        helper.run(&format!("add {name} -i {name}"));
    }
    for locale in ["cs_CZ.UTF-8", "da_DK.UTF-8"] {
        let environment = [("LC_ALL", OsStr::new(locale))];
        for command in ["status --json", "status --warnings", "diff ** --json"] {
            compare(&helper, command, &environment);
        }
    }
}

#[test]
fn stale_temporary_output_is_cleaned_after_status_and_diff() {
    let helper = Helper::new();
    helper.re_init_workspace_with(false);
    helper.create_component_bar_foo("module.exports = 'temporary';");
    helper.add_component_bar_foo();
    for command in ["status --json", "diff bar/foo --json"] {
        helper.output_file(".bitTmp/stale/source.js", "old versioning output");
        compare(&helper, command, &[]);
        assert!(!helper.scopes.local_path.join(".bitTmp").exists());
    }
}

#[test]
fn unresolved_workspace_merge_configuration_is_reported() {
    let helper = Helper::new();
    helper.re_init_workspace_with(false);
    helper.create_component_bar_foo("module.exports = 'workspace conflict';");
    helper.add_component_bar_foo();
    helper.output_file(
        "merge-conflict",
        "[*] WORKSPACE\n<<<<<<< ours\n{}\n=======\n{}\n>>>>>>> theirs\n",
    );
    compare(&helper, "status --json", &[]);
    compare(&helper, "status --warnings", &[]);
}

#[test]
fn canonically_seeded_remote_lane_merge_status_and_diff_match_node() {
    let helper = merge_workspace_with(crate::helper::remote::seed_after_node_export);
    compare(&helper, "status --json", &[]);
    compare(&helper, "diff bar/foo --json", &[]);
}

#[cfg(windows)]
#[test]
fn pinned_windows_node_export_still_completes_its_local_lifecycle() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.create_component_bar_foo("module.exports = 'export lifecycle';");
    helper.add_component_bar_foo();
    helper.tag_without_build("", "");
    crate::helper::remote::node_export(&helper);
    let status = Helper::cmd_in_with(
        &helper.scopes.local_path,
        "status --json",
        &[("BIT_NATIVE", OsStr::new("off"))],
    );
    assert!(status.status.success(), "{}", status.stderr);
    assert_eq!(parse(&status.stdout)["stagedComponents"], serde_json::json!([]));
}
