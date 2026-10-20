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
    compare_owned(helper, command, ci, true)
}

fn compare_owned(
    helper: &Helper,
    command: &str,
    ci: bool,
    expected_native: bool,
) -> crate::helper::Run {
    let oracle = helper.clone_workspace();
    let variables = if ci { vec![("CI", OsStr::new("1"))] } else { Vec::new() };
    let mut node_variables = variables.clone();
    node_variables.push(("BIT_NATIVE", OsStr::new("off")));
    let node = Helper::cmd_in_with(&oracle, command, &node_variables);
    let native = Helper::cmd_in_with(&helper.scopes.local_path, command, &variables);
    assert_ownership(&native, expected_native);
    assert_eq!(native.status.code(), node.status.code(), "{} {}", native.stderr, node.stderr);
    assert_eq!(native.stderr, node.stderr);
    assert_eq!(normalized_progress(&native.stdout), normalized_progress(&node.stdout));
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

fn normalized_progress(text: &str) -> String {
    text.lines()
        .filter(|line| !line.contains("importing components (completed in"))
        .collect::<Vec<_>>()
        .join("\n")
}

fn assert_ownership(result: &crate::helper::Run, expected_native: bool) {
    assert_eq!(result.native, expected_native, "{}", result.trace);
    if !expected_native {
        assert!(
            result.trace.contains(
                "the engine declined commandPlan: command checkout failure requires canonical error"
            ),
            "{}",
            result.trace,
        );
    }
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
    let parsed_reference = parsed_short_reference(&reference[..7]);
    for command in [
        format!("checkout {} comp1 -x --force-theirs", &reference[..7]),
        format!("revert comp1 {} -x", &reference[..7]),
    ] {
        helper.get_cloned_workspace(&baseline);
        let before = short_ref_workspace_files(&helper);
        let expected_native = cfg!(windows) || reference.starts_with(&parsed_reference);
        let result = compare_owned(&helper, &command, false, expected_native);
        if !cfg!(windows) && reference.starts_with(&parsed_reference) {
            assert!(result.status.success());
        } else {
            assert_eq!(result.status.code(), Some(1));
            // The independent command oracle above requires the exact published diagnostic:
            // numeric coercion can fail in hasVersion before a repository short-ref lookup.
            assert_eq!(short_ref_workspace_files(&helper), before);
        }
    }
}

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
    let before = short_ref_workspace_files(&helper);
    let command = format!("checkout {} comp1 -x", &reference[..7]);
    let native = helper.cmd(&command);
    let node = Helper::cmd_in_with(&oracle, &command, &[("BIT_NATIVE", OsStr::new("off"))]);
    let parsed_reference = parsed_short_reference(&reference[..7]);
    assert_ownership(&native, cfg!(windows) || reference.starts_with(&parsed_reference));
    assert_eq!(native.status.code(), node.status.code());
    assert!(!native.status.success());
    assert_eq!(native.stderr, node.stderr);
    assert_eq!(normalized_progress(&native.stdout), normalized_progress(&node.stdout));
    let expected = if cfg!(windows) || !reference.starts_with(&parsed_reference) {
        format!("failed finding an object with the short hash {parsed_reference}")
    } else {
        format!(
            "found 2 objects with the same short hash {parsed_reference}, please use longer hash",
        )
    };
    assert_eq!(native.stderr, expected);
    assert_eq!(short_ref_workspace_files(&helper), before);
}

// The released yargs parser can turn an otherwise hexadecimal short ref into a number.
fn parsed_short_reference(raw: &str) -> String {
    if raw.starts_with('0') && raw.len() > 1 {
        return raw.into();
    }
    let Ok(number) = raw.parse::<f64>() else { return raw.into() };
    if !number.is_finite() || number.floor().abs() > 9_007_199_254_740_991.0 {
        return raw.into();
    }
    bit_object_import::stringify_json(&serde_json::json!(number), false).unwrap()
}

// Truly absent short references retain the released pre-effect delegation boundary.
#[test]
fn numeric_checkout_and_revert_targets_preserve_released_errors_without_writes() {
    let helper = workspace();
    let before = short_ref_workspace_files(&helper);
    for target in ["38938e0", "0xabc", "0012345", "9007199254740992"] {
        for command in [format!("checkout {target} comp1 -x"), format!("revert comp1 {target} -x")]
        {
            let result = compare_owned(&helper, &command, false, false);
            assert!(!result.status.success(), "{command}");
            assert_eq!(short_ref_workspace_files(&helper), before);
        }
    }
}
