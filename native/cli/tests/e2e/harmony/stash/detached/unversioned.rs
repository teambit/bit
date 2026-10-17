//! A new aspect dependency reaches the published graph error before detached persistence.
use super::{compare_command, controls, workspace};
use crate::helper::{Helper, config};
use serde_json::json;
use std::{collections::BTreeMap, fs, io::Read, path::Path};

#[test]
fn tracked_component_using_a_new_aspect_keeps_the_exact_pre_persistence_failure() {
    let helper = workspace();
    let id = new_aspect(&helper);
    config::set_workspace_key(&helper.scopes.local_path, &id, json!({}));
    helper.output_file(
        "comp1/component.json",
        &json!({"componentId":{"name":"comp1","scope":helper.scopes.remote},"extensions":{id:{}}})
            .to_string(),
    );
    let actual = helper.clone_workspace();
    let expected = helper.clone_workspace();
    let before = controls(&actual);
    let objects = inflated_objects(&actual);
    compare_command(&actual, &expected, "stash save --include-new");
    assert_eq!(controls(&actual), before);
    assert_history_prefix(&objects, &actual, &expected);
    for root in [&actual, &expected] {
        assert!(!bit_object_import::scope_path(root).join("stash").exists());
        assert!(root.join("fresh-aspect/index.js").is_file());
        assert!(fs::read_to_string(root.join("comp1/index.js")).unwrap().contains("base"));
    }
}
fn new_aspect(helper: &Helper) -> String {
    let source = "class Aspect {static dependencies=[];static async provider(){console.log('fixture new aspect provider');return {};}};module.exports={default:Aspect};";
    helper.output_file("fresh-aspect/index.js", source);
    helper.run("add fresh-aspect -i fresh/aspect");
    config::set_component_env(&helper.scopes.local_path, "fresh/aspect", "teambit.harmony/aspect");
    helper.run("link");
    helper.output_file("fresh-aspect/dist/index.js", source);
    helper.output_file(&format!("node_modules/.bit_roots/teambit.harmony_aspect/node_modules/@{}/fresh.aspect/dist/index.js",helper.scopes.remote),source);
    format!("{}/fresh/aspect", helper.scopes.remote)
}

fn assert_history_prefix(before: &BTreeMap<String, Vec<u8>>, actual: &Path, expected: &Path) {
    let published = inflated_objects(actual);
    assert_eq!(published, inflated_objects(expected));
    for (path, bytes) in before {
        assert_eq!(published.get(path), Some(bytes), "baseline object {path}");
    }
    for (path, bytes) in &published {
        if !before.contains_key(path) {
            assert!(bytes.starts_with(b"VersionHistory "), "unexpected object {path}");
        }
    }
}

fn inflated_objects(root: &Path) -> BTreeMap<String, Vec<u8>> {
    super::proof::objects(root)
        .into_iter()
        .map(|(path, packed)| {
            let mut bytes = Vec::new();
            flate2::read::ZlibDecoder::new(packed.as_slice()).read_to_end(&mut bytes).unwrap();
            (path, bytes)
        })
        .collect()
}
