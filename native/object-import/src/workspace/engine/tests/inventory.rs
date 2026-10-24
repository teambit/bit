use super::{Directory, POOL, frame};
use crate::workspace::{engine::serve, snapshots::State};
use serde_json::{Value, json};
use std::io::Cursor;

fn request(input: &Value, owner: &mut State) -> Value {
    let mut output = Vec::new();
    serve(&mut Cursor::new(frame(input)), &mut output, &POOL, owner).unwrap();
    serde_json::from_slice(&output).unwrap()
}
fn begin(directory: &Directory, owner: &mut State) -> Value {
    request(
        &json!({"kind":"inventoryBegin","root":directory.0,"workspace":directory.0,
        "excludeDirs":[],"rootPolicy":{"rules":[]}}),
        owner,
    )
}
fn finish(token: u64, owner: &mut State) -> Value {
    request(
        &json!({"kind":"inventoryFinish","token":token,"combined":{"rules":[]},
        "hard":{"rules":[]},"own":{"rules":[]},"ignoredRoot":[]}),
        owner,
    )
}
#[test]
fn inventory_is_owned_bounded_and_tokens_cannot_be_reused() {
    let directory = Directory::new();
    directory.write("main.js", b"x");
    let mut owner = State::default();
    let initial = begin(&directory, &mut owner);
    let token = initial["data"]["token"].as_u64().unwrap();
    assert_eq!(initial["completed"], 1);
    assert_eq!(begin(&directory, &mut owner)["failed"], false);
    assert_eq!(finish(token, &mut State::default())["failed"], true);
    assert_eq!(finish(token, &mut owner)["data"]["files"][0]["relativePath"], "main.js");
    assert_eq!(finish(token, &mut owner)["failed"], true);
    let next = begin(&directory, &mut owner)["data"]["token"].as_u64().unwrap();
    assert!(next > token);
    assert_eq!(
        request(&json!({"kind":"inventoryCancel","token":next}), &mut owner)["failed"],
        false,
    );
    assert_eq!(finish(next, &mut owner)["failed"], true);
}
#[test]
fn a_missing_component_directory_is_empty_but_the_workspace_root_must_exist() {
    let directory = Directory::new();
    let missing = directory.0.join("deleted-component");
    let mut owner = State::default();
    let input = json!({"kind":"inventoryBegin","root":missing,"workspace":directory.0,
        "excludeDirs":[],"rootPolicy":{"rules":[]}});
    let started = request(&input, &mut owner);
    assert_eq!(started["failed"], false);
    assert_eq!(started["completed"], 0);
    let token = started["data"]["token"].as_u64().unwrap();
    assert_eq!(finish(token, &mut owner)["data"]["files"], json!([]));
    let absent_workspace = request(
        &json!({"kind":"inventoryBegin","root":missing,
        "workspace":missing,"excludeDirs":[],"rootPolicy":{"rules":[]}}),
        &mut owner,
    );
    assert_eq!(absent_workspace["failed"], true);
}
#[test]
fn inventory_failure_releases_retained_paths_and_unicode_declines_before_publication() {
    let directory = Directory::new();
    directory.write("main.js", b"x");
    let mut owner = State::default();
    let token = begin(&directory, &mut owner)["data"]["token"].as_u64().unwrap();
    let failed = request(
        &json!({"kind":"inventoryFinish","token":token,
        "combined":{"rules":[{"source":"[","negative":false}]},
        "hard":{"rules":[]},"own":{"rules":[]},"ignoredRoot":[]}),
        &mut owner,
    );
    assert_eq!(failed["failed"], true);
    assert!(failed.get("data").is_none());
    let next = begin(&directory, &mut owner)["data"]["token"].as_u64().unwrap();
    assert_eq!(
        request(&json!({"kind":"inventoryCancel","token":next}), &mut owner)["failed"],
        false,
    );
    directory.write("ı", b"x");
    assert_eq!(begin(&directory, &mut owner)["failed"], true);
    std::fs::remove_file(directory.0.join("ı")).unwrap();
    assert_eq!(begin(&directory, &mut owner)["failed"], false);
}

#[test]
fn pending_inventory_count_is_bounded_and_cancellation_frees_capacity() {
    let directory = Directory::new();
    directory.write("main.js", b"x");
    let mut owner = State::default();
    for _ in 0..32 {
        assert_eq!(begin(&directory, &mut owner)["failed"], false);
    }
    assert_eq!(begin(&directory, &mut owner)["failed"], true);
    assert_eq!(request(&json!({"kind":"inventoryCancel","token":1}), &mut owner)["failed"], false);
    assert_eq!(begin(&directory, &mut owner)["failed"], false);
}
