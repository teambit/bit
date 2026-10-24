pub(super) static POOL: std::sync::LazyLock<rayon::ThreadPool> = std::sync::LazyLock::new(|| {
    rayon::ThreadPoolBuilder::new()
        .num_threads(4)
        .build()
        .unwrap()
});
use super::{State, serve, write};
use serde_json::{Value, json};
use std::io::Cursor;

fn hash_value(byte: char) -> String {
    byte.to_string().repeat(40)
}
fn request(state: &mut State, value: impl serde::Serialize) -> Value {
    let bytes = serde_json::to_vec(&value).unwrap();
    let mut frame = 17_u32.to_be_bytes().to_vec();
    frame.extend((bytes.len() as u32).to_be_bytes());
    frame.extend(bytes);
    let mut output = Vec::new();
    serve(&mut Cursor::new(frame), &mut output, state, &POOL).unwrap();
    serde_json::from_slice(&output).unwrap()
}
fn entry(name: &str) -> Value {
    json!({"id":{"scope":"scope","name":name},"head":hash_value('a'),
        "laneId":{"scope":"scope","name":"lane"},"mergedConfig":{"2":"two","a":"å"}})
}
fn lane() -> Value {
    json!({"kind":"laneSnap","version":hash_value('b'),"versionHash":hash_value('c'),
        "isLegacy":false,"parent":hash_value('a'),"existingHidden":false,
        "readmeSameName":false,"removed":false,"detachHead":false,"overrideHead":false})
}
#[test]
fn lane_parent_and_hidden_default() {
    let mut input = lane();
    input["existingHidden"] = json!(true);
    input["readmeSameName"] = json!(true);
    let output = request(&mut State::default(), input);
    assert_eq!(
        output["data"],
        json!({"parent":hash_value('a'),"bucket":"hidden",
        "overrideUpdateDependents":false,"updateReadme":true}),
    );
}
#[test]
fn explicit_hidden_switch_sets_override() {
    let mut input = lane();
    input["explicitHidden"] = json!(true);
    input["existingVisibleHead"] = json!(hash_value('d'));
    let output = request(&mut State::default(), input);
    assert_eq!(output["data"]["overrideUpdateDependents"], true);
}
#[test]
fn lane_legacy_keeps_parents_and_missing_previous_declines() {
    let mut input = lane();
    input["isLegacy"] = json!(true);
    assert!(request(&mut State::default(), input.clone())["data"].get("parent").is_none());
    input
        .as_object_mut()
        .unwrap()
        .remove("parent");
    input["modelHead"] = json!(hash_value('a'));
    assert_eq!(request(&mut State::default(), input)["failed"], true);
}
fn reconcile() -> Value {
    json!({"kind":"reconcileSnap","isLegacy":false,"currentParents":[hash_value('a')],
        "entry":{"head":hash_value('b'),"lane":{"scope":"scope","name":"lane"}}})
}
#[test]
fn merge_parent_append_and_duplicate_preservation() {
    let mut input = reconcile();
    let output = request(&mut State::default(), input.clone());
    assert_eq!(output["data"]["parents"], json!([hash_value('a'), hash_value('b')]));
    input["currentParents"] = json!([hash_value('b'), hash_value('b')]);
    input["currentMessage"] = json!("message");
    let output = request(&mut State::default(), input);
    assert_eq!(output["data"]["parents"], json!([hash_value('b'), hash_value('b')]));
    assert_eq!(output["data"]["setMergeMessage"], false);
}
#[test]
fn legacy_unrelated_retains_tag_identity_and_legacy_parents() {
    let mut input = reconcile();
    input["entry"]["unrelated"] = json!(true);
    assert_eq!(request(&mut State::default(), input.clone())["failed"], true);
    input["previouslyUsedVersion"] = json!("1.2.3");
    input["isLegacy"] = json!(true);
    let output = request(&mut State::default(), input);
    assert_eq!(output["data"]["unrelated"]["head"], "1.2.3");
    assert_eq!(output["data"]["parents"], json!([hash_value('a')]));
    assert_eq!(output["data"]["setMergeMessage"], false);
}
#[test]
fn squash_keeps_parents_and_records_previous_pair() {
    let mut input = reconcile();
    input["entry"]["shouldSquash"] = json!(true);
    let output = request(&mut State::default(), input.clone());
    assert_eq!(
        output["data"]["squashed"]["previousParents"],
        json!([hash_value('a'), hash_value('b')]),
    );
    input["currentParents"] = json!([]);
    assert_eq!(request(&mut State::default(), input)["failed"], true);
}
#[test]
fn state_remove_first_duplicate_and_stale_token_declines() {
    let mut state = State::default();
    let initialized = request(
        &mut state,
        json!({"kind":"initialize","entries":[entry("a"),entry("b"),entry("a")]}),
    );
    let action = json!({"kind":"transition","token":initialized["data"]["token"],"revision":0,
        "action":{"kind":"remove","ids":[{"scope":"scope","name":"a"},{"scope":"scope","name":"a"}]}});
    let output = request(&mut state, action.clone());
    assert_eq!(output["data"]["indices"], json!([1, 2]));
    assert_eq!(output["data"]["revision"], 1);
    assert_eq!(request(&mut state, action)["failed"], true);
}
#[test]
fn state_duplicate_add_declines_without_revision_change() {
    let mut state = State::default();
    let initialized = request(&mut state, json!({"kind":"initialize","entries":[entry("a")]}));
    let token = initialized["data"]["token"].clone();
    let output = request(
        &mut state,
        json!({"kind":"transition","token":token,"revision":0,
        "action":{"kind":"add","entry":entry("a")}}),
    );
    assert_eq!(output["failed"], true);
    state
        .verify(token.as_str().unwrap(), 0)
        .unwrap();
}
#[test]
fn empty_remove_all_changes_and_missing_remove_advances_revision() {
    let mut state = State::default();
    let initialized = request(&mut state, json!({"kind":"initialize","entries":[]}));
    let output = request(
        &mut state,
        json!({"kind":"transition","token":initialized["data"]["token"],"revision":0,
        "action":{"kind":"removeAll"}}),
    );
    assert_eq!(output["data"]["changed"], true);
    let output = request(
        &mut state,
        json!({"kind":"transition","token":output["data"]["token"],"revision":1,
        "action":{"kind":"remove","ids":[]}}),
    );
    assert_eq!(output["data"]["changed"], false);
    assert_eq!(output["data"]["revision"], 2);
}
#[test]
fn commit_preserves_exact_json_and_declines_mismatched_state() {
    let path =
        std::env::temp_dir().join(format!("bit-merge-state-test-{}.json", std::process::id()));
    let mut state = State::default();
    let entries = json!([entry("a")]);
    let initialized = request(&mut state, json!({"kind":"initialize","entries":entries}));
    let mut commit = json!({"kind":"commit","token":initialized["data"]["token"],"revision":0,
        "path":path,"contents":"[]"});
    assert_eq!(request(&mut state, commit.clone())["failed"], true);
    assert!(!path.exists());
    let contents = "[\n  {\"id\":{\"scope\":\"scope\",\"name\":\"a\"},\"head\":\"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\",\"laneId\":{\"scope\":\"scope\",\"name\":\"lane\"},\"mergedConfig\":{\"a\":\"å\",\"2\":\"two\"}}\n]";
    commit["contents"] = json!(contents);
    assert_eq!(request(&mut state, commit)["failed"], false);
    assert_eq!(std::fs::read_to_string(&path).unwrap(), contents);
    std::fs::remove_file(path).unwrap();
}

#[cfg(unix)]
#[test]
fn overwrite_preserves_inode_permissions_and_rejects_linked_files() {
    use std::os::unix::fs::{MetadataExt, PermissionsExt, symlink};
    let root = std::env::temp_dir().join(format!("bit-merge-state-links-{}", std::process::id()));
    std::fs::create_dir_all(&root).unwrap();
    let path = root.join("state.json");
    std::fs::write(&path, b"old").unwrap();
    std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o640)).unwrap();
    let before = std::fs::metadata(&path).unwrap();
    write::commit(&path, "new").unwrap();
    let after = std::fs::metadata(&path).unwrap();
    assert_eq!(
        (before.ino(), before.mode(), before.uid(), before.gid()),
        (after.ino(), after.mode(), after.uid(), after.gid()),
    );
    let link = root.join("link.json");
    symlink(&path, &link).unwrap();
    assert!(write::commit(&link, "bad").is_err());
    let hard = root.join("hard.json");
    std::fs::hard_link(&path, &hard).unwrap();
    assert!(write::commit(&path, "bad").is_err());
    assert_eq!(std::fs::read(&path).unwrap(), b"new");
    std::fs::remove_dir_all(root).unwrap();
}
#[test]
fn malformed_complete_and_truncated_frames_do_not_reset_state() {
    let mut state = State::default();
    let initialized = request(&mut state, json!({"kind":"initialize","entries":[entry("a")]}));
    assert_eq!(request(&mut state, json!({"kind":"initialize","entries":[{}]}))["failed"], true);
    state
        .verify(initialized["data"]["token"].as_str().unwrap(), 0)
        .unwrap();
    let mut frame = 1_u32.to_be_bytes().to_vec();
    frame.extend(15_u32.to_be_bytes());
    frame.extend(b"{}");
    let mut output = Vec::new();
    assert!(serve(&mut Cursor::new(frame), &mut output, &mut state, &POOL).is_err());
    assert!(output.is_empty());
}
#[test]
fn object_unrelated_parent_and_priority_over_squash() {
    let mut input = reconcile();
    input["previouslyUsedVersion"] = json!("1.2.3");
    input["entry"]["shouldSquash"] = json!(true);
    input["entry"]["unrelated"] = json!({"unrelatedHead":hash_value('d'),
        "unrelatedLane":{"scope":"other","name":"old"},"headOnCurrentLane":hash_value('c')});
    let output = request(&mut State::default(), input);
    assert_eq!(output["data"]["parents"], json!([hash_value('c')]));
    assert_eq!(output["data"]["mode"], "unrelated");
    assert_eq!(output["data"]["unrelated"]["head"], hash_value('d'));
}

#[cfg(windows)]
#[test]
fn windows_overwrite_preserves_file_identity_and_rejects_links_before_truncation() {
    let root = std::env::temp_dir().join(format!("bit-merge-state-windows-{}", std::process::id()));
    std::fs::create_dir_all(&root).unwrap();
    let path = root.join("state.json");
    std::fs::write(&path, b"old").unwrap();
    let original = std::fs::File::open(&path).unwrap();
    let before = winapi_util::file::information(&original).unwrap();
    write::commit(&path, "new").unwrap();
    let after = winapi_util::file::information(&std::fs::File::open(&path).unwrap()).unwrap();
    assert_eq!(before.volume_serial_number(), after.volume_serial_number());
    assert_eq!(before.file_index(), after.file_index());
    let link = root.join("link.json");
    std::os::windows::fs::symlink_file(&path, &link).unwrap();
    assert!(write::commit(&link, "bad").is_err());
    let hard = root.join("hard.json");
    std::fs::hard_link(&path, &hard).unwrap();
    assert!(write::commit(&path, "bad").is_err());
    assert_eq!(std::fs::read(&path).unwrap(), b"new");
    assert_eq!(std::fs::read(&hard).unwrap(), b"new");
    std::fs::remove_dir_all(root).unwrap();
}
