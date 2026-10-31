//! Object-only imports preserve workspace roots while refreshing lane metadata.
use crate::helper::{Helper, Run, parse};
use serde_json::{Value, json};
use std::{ffi::OsStr, fs, path::Path};

#[test]
fn no_id_lane_import_matches_released_output_and_keeps_workspace_versions() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(2, true, "");
    helper.native("tag --skip-tests");
    helper.native("export");
    helper.native("lane create dev");
    helper.native("snap comp2 --skip-auto-snap --unmodified --skip-tests");
    helper.native("export");
    let baseline = helper.clone_workspace();
    helper.native("snap comp2 --skip-auto-snap --unmodified --skip-tests");
    helper.native("export");
    let head = helper.get_head_from_lane("dev", "comp2");
    helper.get_cloned_workspace(&baseline);
    let remote = helper.clone_remote_scope();
    for (command, ci) in [("import", false), ("import", true), ("import --all-history", false)] {
        compare(&helper, &baseline, &remote, &head, command, ci);
    }
    compare_json_failure(&helper, &baseline, &remote);
}

fn compare(helper: &Helper, baseline: &Path, remote: &Path, head: &str, command: &str, ci: bool) {
    helper.get_cloned_workspace(baseline);
    helper.restore_remote_scope(remote);
    let bitmap = helper.read_bit_map();
    let mut environment = vec![("BIT_NATIVE", OsStr::new("off"))];
    if ci {
        environment.push(("CI", OsStr::new("1")));
    }
    let node = Helper::cmd_in_with(&helper.scopes.local_path, command, &environment);
    assert!(node.status.success(), "{node:?}");
    let expected = state(helper, head);
    assert_eq!(helper.read_bit_map(), bitmap);
    helper.get_cloned_workspace(baseline);
    helper.restore_remote_scope(remote);
    let native = import_with(helper, command, ci);
    assert!(native.trace.contains("engine commandInboundApply"), "{native:?}");
    assert_eq!(stable(&native.stdout), stable(&node.stdout));
    assert_eq!(native.stderr, node.stderr);
    assert_eq!(state(helper, head), expected);
    assert_eq!(helper.read_bit_map(), bitmap);
}

fn state(helper: &Helper, head: &str) -> Value {
    json!({
        "lane":parse(&helper.native("cat-lane dev")),
        "version":parse(&helper.native(&format!("cat-object {head}"))),
        "bitmap":helper.read_bit_map(),
        "source":fs::read(helper.scopes.local_path.join("comp2/index.js")).unwrap(),
        "package":package(helper),
    })
}

#[test]
fn no_id_lane_import_refreshes_hidden_versions_without_promoting_them() {
    let helper = Helper::new();
    super::build_base_remote_state(&helper);
    let remote = &helper.scopes.remote;
    helper.re_init_workspace();
    helper.add_remote_scope();
    helper.run(&format!("lane import {remote}/dev -x"));
    let bitmap = helper.read_bit_map();
    helper.seed_hidden_update_dependent(&format!("{remote}/comp2"), &format!("{remote}/dev"));
    let expected = parse(&Helper::cmd_in(&helper.scopes.remote_path, "cat-lane dev").stdout);
    let hidden = expected["updateDependents"][0].as_str().unwrap();
    let head = hidden.rsplit_once('@').unwrap().1;
    let run = import(&helper);
    assert!(run.status.success(), "{run:?}");
    assert!(run.trace.contains("engine commandInboundApply"), "{run:?}");
    assert_eq!(parse(&helper.native("cat-lane dev")), expected);
    assert_eq!(helper.read_bit_map(), bitmap);
    let version = parse(&helper.native(&format!("cat-object {head}")));
    assert_eq!(
        version["parents"]
            .as_array()
            .unwrap()
            .len(),
        1,
    );
}

fn import(helper: &Helper) -> Run {
    import_with(helper, "import", false)
}

fn import_with(helper: &Helper, command: &str, ci: bool) -> Run {
    let unavailable = helper.scopes.e2e_dir.join("unavailable-node");
    let mut environment = vec![("BIT_NODE_BINARY", unavailable.as_os_str())];
    if ci {
        environment.push(("CI", OsStr::new("1")));
    }
    let run = Helper::cmd_in_with(&helper.scopes.local_path, command, &environment);
    assert!(run.native && run.status.success(), "{run:?}");
    assert!(!run.trace.contains("starting the JavaScript host"), "{run:?}");
    run
}

fn stable(output: &str) -> String {
    output
        .split_inclusive('\n')
        .fold(String::new(), |mut result, line| {
            if let Some((prefix, duration)) = line.split_once("(completed in ") {
                let (duration, suffix) = duration.split_once(')').unwrap();
                let number = duration
                    .strip_suffix("ms")
                    .or_else(|| duration.strip_suffix('s'))
                    .unwrap();
                assert!(number.parse::<f64>().is_ok());
                result.push_str(prefix);
                result.push_str("(completed in TIME)");
                result.push_str(suffix);
            } else {
                result.push_str(line);
            }
            result
        })
}

#[test]
fn no_id_lane_import_fetches_hidden_cascades_from_the_lane_scope() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    let (origin, origin_path) = helper.new_bare_scope_connected();
    helper.populate_components(3, false, "");
    helper.native(&format!("scope set {origin} comp2"));
    helper.link("--rewire");
    helper.run("compile");
    helper.native("tag --skip-tests");
    helper.native("export");
    helper.native("lane create dev");
    helper.native("snap comp3 --skip-auto-snap --unmodified --skip-tests");
    helper.native("export");
    let lane = format!("{}/dev", helper.scopes.remote);
    let component = format!("{origin}/comp2");
    helper.seed_hidden_update_dependent(&component, &lane);
    helper.re_init_workspace();
    helper.add_remote_scope();
    helper.add_remote(&origin_path);
    helper.run(&format!("lane import {lane} -x"));
    let bitmap = helper.read_bit_map();
    let previous = parse(&helper.native("cat-lane dev"))["updateDependents"][0]
        .as_str()
        .unwrap()
        .to_owned();
    helper.seed_hidden_update_dependent(&component, &lane);
    let expected = parse(&Helper::cmd_in(&helper.scopes.remote_path, "cat-lane dev").stdout);
    let current = expected["updateDependents"][0].as_str().unwrap();
    assert_ne!(current, previous);
    import(&helper);
    assert_eq!(parse(&helper.native("cat-lane dev")), expected);
    assert_eq!(helper.read_bit_map(), bitmap);
    let version = parse(&helper.native(&format!("cat-component {current} --json")));
    assert_eq!(version["parents"], json!([previous.rsplit_once('@').unwrap().1]));
}

fn package(helper: &Helper) -> Option<Vec<u8>> {
    match fs::read(helper.scopes.local_path.join("comp2/package.json")) {
        Ok(bytes) => Some(bytes),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => None,
        Err(error) => panic!("component package metadata: {error}"),
    }
}

fn compare_json_failure(helper: &Helper, baseline: &Path, remote: &Path) {
    helper.get_cloned_workspace(baseline);
    helper.restore_remote_scope(remote);
    let bitmap = helper.read_bit_map();
    let node = Helper::cmd_in_with(
        &helper.scopes.local_path,
        "import --json",
        &[("BIT_NATIVE", OsStr::new("off"))],
    );
    assert!(!node.status.success(), "{node:?}");
    helper.get_cloned_workspace(baseline);
    helper.restore_remote_scope(remote);
    let native = Helper::cmd_in(&helper.scopes.local_path, "import --json");
    assert!(!native.native, "{native:?}");
    assert!(native.trace.contains("released no-ID JSON import argument failure"));
    assert!(!native.trace.contains("engine commandInboundApply"));
    assert_eq!(native.status.code(), node.status.code());
    assert_eq!(native.stdout, node.stdout);
    assert_eq!(native.stderr, node.stderr);
    assert_eq!(helper.read_bit_map(), bitmap);
}
