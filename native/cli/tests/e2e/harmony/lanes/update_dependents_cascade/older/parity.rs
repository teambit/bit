//! Compare the shared direct-cascade path with the released CLI, including stored metadata.
use super::fixture;
use crate::helper::{Helper, parse};
use serde_json::{Value, json};
use std::ffi::OsStr;

#[test]
fn direct_hidden_cascade_matches_released_output_and_object_metadata() {
    let helper = fixture(false);
    let baseline = helper.clone_workspace();
    let remote = helper.clone_remote_scope();
    let command = "snap comp3 --unmodified --skip-tests -m cascade";
    let node = Helper::cmd_in_with(
        &helper.scopes.local_path,
        command,
        &[("BIT_NATIVE", OsStr::new("off"))],
    );
    assert!(node.status.success(), "{node:?}");
    let (expected, node_hashes) = state(&helper);
    helper.get_cloned_workspace(&baseline);
    helper.restore_remote_scope(&remote);
    let native = helper.native_run(command);
    assert!(native.status.success(), "{native:?}");
    assert!(native.trace.contains("engine commandSnapApply"), "{native:?}");
    let (actual, native_hashes) = state(&helper);
    assert_eq!(normalize(&native.stdout, &native_hashes), normalize(&node.stdout, &node_hashes));
    assert_eq!(native.stderr, node.stderr);
    assert_eq!(actual, expected);
}

fn state(helper: &Helper) -> (Value, Vec<String>) {
    let lane = parse(&helper.native("cat-lane dev"));
    let ids = [
        format!("{}/comp3@{}", helper.scopes.remote, helper.get_head_from_lane("dev", "comp3")),
        super::hidden(&lane, "comp2").to_owned(),
    ];
    let hashes = ids
        .iter()
        .map(|id| {
            id.rsplit_once('@')
                .unwrap()
                .1
                .to_owned()
        })
        .collect::<Vec<_>>();
    let versions = ids
        .iter()
        .map(|id| version(helper, id))
        .collect::<Vec<_>>();
    let value = json!({"lane":lane,"bitmap":helper.read_bit_map(),"versions":versions});
    (parse(&normalize(&value.to_string(), &hashes)), hashes)
}

fn version(helper: &Helper, id: &str) -> Value {
    let mut value = parse(&helper.native(&format!("cat-component {id} --json")));
    if let Some(batch) = value.get_mut("batchId") {
        assert!(batch.is_string());
        *batch = json!("BATCH_ID");
    }
    assert!(value["log"]["date"].is_string());
    value["log"]["date"] = json!("LOG_DATE");
    for field in ["flattenedEdgesRef", "dependenciesGraphRef"] {
        if let Some(reference) = value[field].as_str() {
            value[field] = parse(&helper.native(&format!("cat-object {reference} -s")));
        }
    }
    value
}

fn normalize(text: &str, hashes: &[String]) -> String {
    let mut result = text.to_owned();
    for (index, hash) in hashes.iter().enumerate() {
        result = result.replace(hash, &format!("SNAP_{index}"));
    }
    result
}
