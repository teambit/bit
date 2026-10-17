//! Checkout and revert use the published workspace component-pattern grammar.
use crate::helper::{Helper, config};
use std::{ffi::OsStr, fs};

fn workspace() -> Helper {
    let helper = Helper::new();
    helper.re_init_workspace_with(false);
    helper.populate_components(3, true, "");
    helper.tag_without_build("", "--message first");
    for index in 1..=3 {
        helper.append_file(&format!("comp{index}/index.js"), "\n// second version");
    }
    helper.tag_without_build("", "--message second");
    helper
}

fn compare(helper: &Helper, command: &str) {
    compare_with(helper, command, true);
}

fn compare_with(helper: &Helper, command: &str, ci: bool) -> crate::helper::Run {
    let oracle = helper.clone_workspace();
    let variables = if ci { vec![("CI", OsStr::new("1"))] } else { Vec::new() };
    let mut node_variables = variables.clone();
    node_variables.push(("BIT_NATIVE", OsStr::new("off")));
    let node = Helper::cmd_in_with(&oracle, command, &node_variables);
    let native = Helper::cmd_in_with(&helper.scopes.local_path, command, &variables);
    assert!(native.native, "{}", native.trace);
    assert_eq!(native.status.code(), node.status.code(), "{} {}", native.stderr, node.stderr);
    assert_eq!(native.stderr, node.stderr);
    let normalize = |text: &str| {
        text.lines()
            .filter(|line| !line.contains("importing components (completed in"))
            .collect::<Vec<_>>()
            .join("\n")
    };
    assert_eq!(normalize(&native.stdout), normalize(&node.stdout));
    assert_eq!(
        config::read_jsonc(&helper.scopes.local_path.join(".bitmap")),
        config::read_jsonc(&oracle.join(".bitmap")),
    );
    for index in 1..=3 {
        let file = format!("comp{index}/index.js");
        assert_eq!(
            fs::read(helper.scopes.local_path.join(&file)).unwrap(),
            fs::read(oracle.join(file)).unwrap(),
        );
    }
    native
}

#[test]
fn checkout_and_revert_globs_lists_and_negation_match_node() {
    let helper = workspace();
    let baseline = helper.clone_workspace();
    for command in [
        "checkout 0.0.1 **/comp* -x --force-theirs",
        "checkout 0.0.1 **/comp*,!**/comp2 -x --force-theirs",
        "revert **/comp*,!**/comp2 0.0.1 -x",
        "checkout 0.0.1 **/comp[13]* -x --force-theirs",
    ] {
        helper.get_cloned_workspace(&baseline);
        compare(&helper, command);
    }
}

#[test]
fn modified_state_checkout_reset_and_revert_intersections_match_node() {
    let helper = workspace();
    helper.append_file("comp1/index.js", "\n// local edit");
    let baseline = helper.clone_workspace();
    for command in ["checkout reset $modified -x", r#"revert "**/comp* AND $modified" 0.0.1 -x"#] {
        helper.get_cloned_workspace(&baseline);
        compare(&helper, command);
    }
}

#[test]
fn state_predicate_loader_output_matches_checkout_and_revert() {
    let helper = workspace();
    helper.append_file("comp1/index.js", "\n// local edit");
    let baseline = helper.clone_workspace();
    for command in ["checkout reset $modified -x", r#"revert "**/comp* AND $modified" 0.0.1 -x"#] {
        helper.get_cloned_workspace(&baseline);
        compare_with(&helper, command, false);
    }
}

#[test]
fn checkout_and_revert_resolve_short_snapshot_references() {
    let helper = workspace();
    let model = crate::helper::parse(&helper.run("cat-component comp1 --json"));
    let reference = model["versions"]["0.0.1"].as_str().unwrap();
    let baseline = helper.clone_workspace();
    for command in [
        format!("checkout {} comp1 -x --force-theirs", &reference[..7]),
        format!("revert comp1 {} -x", &reference[..7]),
    ] {
        helper.get_cloned_workspace(&baseline);
        #[cfg(windows)]
        let before = short_ref_workspace_files(&helper);
        let result = compare_with(&helper, &command, false);
        #[cfg(not(windows))]
        assert!(result.status.success());
        #[cfg(windows)]
        {
            assert_eq!(result.status.code(), Some(1));
            assert_eq!(
                result.stderr,
                format!("failed finding an object with the short hash {}", &reference[..7]),
            );
            assert_eq!(short_ref_workspace_files(&helper), before);
        }
    }
}

#[cfg(windows)]
fn short_ref_workspace_files(helper: &Helper) -> Vec<Vec<u8>> {
    [".bitmap", "comp1/index.js", "comp2/index.js", "comp3/index.js"]
        .iter()
        .map(|file| fs::read(helper.scopes.local_path.join(file)).unwrap())
        .collect()
}

#[test]
fn ambiguous_short_references_preserve_canonical_error_without_writes() {
    let helper = workspace();
    let model = crate::helper::parse(&helper.run("cat-component comp1 --json"));
    let reference = model["versions"]["0.0.1"].as_str().unwrap();
    let suffix = if reference.ends_with('0') { "1" } else { "0" };
    let collision = format!("{}{suffix}", &reference[..39]);
    let scope = bit_object_import::scope_path(&helper.scopes.local_path);
    fs::write(
        scope
            .join("objects")
            .join(&collision[..2])
            .join(&collision[2..]),
        b"unreferenced object",
    )
    .unwrap();
    let oracle = helper.clone_workspace();
    let before = config::read_jsonc(&helper.scopes.local_path.join(".bitmap"));
    let command = format!("checkout {} comp1 -x", &reference[..7]);
    let native = helper.cmd(&command);
    let node = Helper::cmd_in_with(&oracle, &command, &[("BIT_NATIVE", OsStr::new("off"))]);
    assert_eq!(native.status.code(), node.status.code());
    assert!(!native.status.success());
    assert_eq!(native.stderr, node.stderr);
    let expected = if cfg!(windows) {
        format!("failed finding an object with the short hash {}", &reference[..7])
    } else {
        format!(
            "found 2 objects with the same short hash {}, please use longer hash",
            &reference[..7],
        )
    };
    assert_eq!(native.stderr, expected);
    assert_eq!(config::read_jsonc(&helper.scopes.local_path.join(".bitmap")), before);
}
