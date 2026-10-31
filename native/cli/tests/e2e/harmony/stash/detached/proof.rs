//! Exercise the retained stash protocol between capture and its first persistent phase.
use super::{controls, workspace};
use crate::helper::setup;
use bit_object_import::WorkspaceSession;
use serde_json::{Value, json};
use std::{collections::BTreeMap, fs, path::Path};

#[test]
fn a_source_changed_after_stash_planning_cannot_publish_any_detached_objects() {
    let helper = workspace();
    let root = &helper.scopes.local_path;
    let before = objects(root);
    let control = controls(root);
    let mut session = WorkspaceSession::new(1).unwrap();
    let prepared = request(
        &mut session,
        &json!({"kind":"commandStashPrepare","root":root,
        "home":setup::shared().root.join("home"),"globalRemotesFile":setup::shared().root.join("globals/config/global-remotes.json")}),
    );
    assert!(prepared["error"].is_null(), "{prepared}");
    let context = &prepared["data"]["context"];
    let token = &prepared["data"]["token"];
    fs::write(root.join("comp1/index.js"), "console.log('captured stash source');\n").unwrap();
    let plan = plan(context, token);
    let planned = request(&mut session, &plan);
    assert!(planned["error"].is_null(), "{planned}");
    assert_eq!(
        planned["data"]["needsStash"]
            .as_array()
            .unwrap()
            .len(),
        1,
    );
    fs::write(root.join("comp1/index.js"), "console.log('concurrent source replacement');\n")
        .unwrap();
    let rejected = request(&mut session, &json!({"kind":"commandStashStageGraph","token":token}));
    assert!(
        rejected["error"]
            .as_str()
            .is_some_and(|error| error.contains("changed")),
        "{rejected}",
    );
    assert_eq!(objects(root), before);
    assert_eq!(controls(root), control);
    assert!(!bit_object_import::scope_path(root).join("stash").exists());
}
#[test]
fn prepared_stash_histories_write_nothing_and_reject_duplicate_preparation() {
    let helper = workspace();
    let root = &helper.scopes.local_path;
    let before = objects(root);
    let mut session = WorkspaceSession::new(1).unwrap();
    let prepared = request(
        &mut session,
        &json!({"kind":"commandStashPrepare","root":root,
        "home":setup::shared().root.join("home"),"globalRemotesFile":setup::shared().root.join("globals/config/global-remotes.json")}),
    );
    assert!(prepared["error"].is_null(), "{prepared}");
    let token = &prepared["data"]["token"];
    let input = json!({"kind":"commandStashStageHistory","token":token,"prepareOnly":true});
    let result = request(&mut session, &input);
    assert!(result["error"].is_null(), "{result}");
    assert!(result["data"]["written"].is_u64());
    assert_eq!(objects(root), before);
    let duplicate = request(&mut session, &input);
    assert!(
        duplicate["error"]
            .as_str()
            .is_some_and(|error| error.contains("already prepared")),
    );
    assert_eq!(objects(root), before);
}

fn plan(context: &Value, token: &Value) -> Value {
    let target = &context["targets"][0];
    let model = &context["models"][0];
    let reference = &model["versions"][target["version"].as_str().unwrap()];
    let stored = context["versions"]
        .as_array()
        .unwrap()
        .iter()
        .find(|row| row[0] == *reference)
        .unwrap()[1]
        .clone();
    let packages = ["packageDependencies", "devPackageDependencies", "peerPackageDependencies"]
        .map(|field| stored[field].clone());
    let component = json!({"identity":target["identity"],"extensions":[],"callbackExtensions":stored["extensions"],
        "packageName":"@fixture/comp1","defaultNode":{"env":{},"policyEntries":[],"devPatterns":{},"devFiles":{},"slotData":[]},
        "dependencyState":{"entries":[],"components":[[],[],[]],"packages":packages}});
    let metadata = [
        "mainFile",
        "dependencies",
        "devDependencies",
        "packageDependencies",
        "devPackageDependencies",
        "peerPackageDependencies",
        "bindingPrefix",
        "overrides",
        "extensions",
    ]
    .into_iter()
    .map(|field| (field.to_owned(), stored[field].clone()))
    .collect::<serde_json::Map<String, Value>>();
    let current = json!({"identity":target["identity"],"version":target["version"],"directory":target["directory"],"files":["index.js"],"current":metadata});
    json!({"kind":"commandStashPlan","token":token,"current":[current],"components":[component],"includeNew":false})
}
fn request(session: &mut WorkspaceSession, value: &Value) -> Value {
    let body = serde_json::to_vec(value).unwrap();
    let mut frame = b"BWS1".to_vec();
    frame.extend_from_slice(&1_u32.to_be_bytes());
    frame.extend_from_slice(&u32::try_from(body.len()).unwrap().to_be_bytes());
    frame.extend_from_slice(&body);
    serde_json::from_slice(&session.request(&frame).unwrap()).unwrap()
}
pub(super) fn objects(root: &Path) -> BTreeMap<String, Vec<u8>> {
    let directory = bit_object_import::scope_path(root).join("objects");
    let mut result = BTreeMap::new();
    for prefix in fs::read_dir(&directory).unwrap() {
        let prefix = prefix.unwrap().path();
        for entry in fs::read_dir(&prefix).unwrap() {
            let path = entry.unwrap().path();
            result.insert(
                path.strip_prefix(&directory)
                    .unwrap()
                    .to_string_lossy()
                    .into_owned(),
                fs::read(path).unwrap(),
            );
        }
    }
    result
}
