//! Lane versions are served by the lane scope even when their component has another origin.
use crate::helper::{Helper, parse};
use serde_json::{Value, json};
use std::{
    collections::BTreeMap,
    ffi::OsStr,
    fs,
    path::{Path, PathBuf},
};

#[test]
fn cross_scope_lane_fetch_matches_released_models_refs_and_reports() {
    for advanced in [false, true] {
        let (helper, origin, origin_path, head) = fixture(advanced);
        compare(&helper, &origin, &origin_path, &head);
    }
}

fn fixture(advanced: bool) -> (Helper, String, PathBuf, String) {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    let (origin, origin_path) = helper.new_bare_scope_connected();
    helper.populate_components(1, true, "");
    helper.native(&format!("scope set {origin} comp1"));
    helper.native("tag --skip-tests");
    crate::helper::remote::publish_to(&helper, &origin_path);
    helper.native("lane create dev");
    helper.native("snap comp1 --skip-auto-snap --unmodified --skip-tests");
    crate::helper::remote::publish(&helper);
    let head = helper.get_head_from_lane("dev", "comp1");
    if advanced {
        helper.native("switch main --skip-fetch -x");
        helper.native("snap comp1 --skip-auto-snap --unmodified --skip-tests");
        crate::helper::remote::publish_to(&helper, &origin_path);
    }
    helper.re_init_workspace();
    helper.add_remote_scope();
    helper.add_remote(&origin_path);
    if advanced {
        helper.native(&format!("import {origin}/comp1 -x"));
    }
    (helper, origin, origin_path, head)
}

fn compare(helper: &Helper, origin: &str, origin_path: &Path, head: &str) {
    let baseline = helper.clone_workspace();
    let remote = helper.clone_remote_scope();
    let other = helper.clone_remote_at(origin_path);
    let command = format!("fetch {}/dev --lanes", helper.scopes.remote);
    let node = Helper::cmd_in_with(
        &helper.scopes.local_path,
        &command,
        &[("BIT_NATIVE", OsStr::new("off"))],
    );
    assert!(node.status.success(), "{node:?}");
    let expected = state(helper, origin, head);
    helper.get_cloned_workspace(&baseline);
    helper.restore_remote_scope(&remote);
    Helper::restore_remote_at(origin_path, &other);
    let native = helper.native_run(&command);
    assert!(native.status.success(), "{native:?}");
    assert!(native.trace.contains("engine commandInboundApply"), "{native:?}");
    assert_eq!(
        super::super::policy::stable(&native.stdout),
        super::super::policy::stable(&node.stdout),
    );
    assert_eq!(native.stderr, node.stderr);
    assert_eq!(state(helper, origin, head), expected);
}

fn state(helper: &Helper, origin: &str, head: &str) -> Value {
    let scope = helper.scopes.local_path.join(".bit");
    let model = parse(&helper.native(&format!("cat-component {origin}/comp1 --json")));
    let version = parse(&helper.native(&format!("cat-component {origin}/comp1@{head} --json")));
    let mut refs = BTreeMap::new();
    read_refs(&scope.join("refs"), &scope, &mut refs);
    json!({"model":model,"version":version,"refs":refs,"bitmap":helper.read_bit_map()})
}

fn read_refs(path: &Path, root: &Path, result: &mut BTreeMap<String, String>) {
    if !path.exists() {
        return;
    }
    for entry in fs::read_dir(path).unwrap() {
        let path = entry.unwrap().path();
        if path.is_dir() {
            read_refs(&path, root, result);
        } else {
            result.insert(
                path.strip_prefix(root)
                    .unwrap()
                    .to_string_lossy()
                    .into_owned(),
                fs::read_to_string(&path).unwrap(),
            );
        }
    }
}
