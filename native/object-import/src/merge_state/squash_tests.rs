use super::{State, serve};
use flate2::{Compression, write::ZlibEncoder};
use serde_json::{Value, json};
use std::{
    fs,
    io::{Cursor, Write},
    path::PathBuf,
    sync::atomic::{AtomicU64, Ordering},
};

fn reference(character: char) -> String {
    character.to_string().repeat(40)
}
fn request(input: impl serde::Serialize) -> Value {
    let bytes = serde_json::to_vec(&input).unwrap();
    let mut frame = 21_u32.to_be_bytes().to_vec();
    frame.extend((bytes.len() as u32).to_be_bytes());
    frame.extend(bytes);
    let mut output = Vec::new();
    serve(&mut Cursor::new(frame), &mut output, &mut State::default()).unwrap();
    serde_json::from_slice(&output).unwrap()
}
fn policy() -> Value {
    json!({"kind":"squashPolicy","sourceOnly":[],"targetOnly":[reference('b'),reference('c')],
        "common":reference('a'),"detachHead":false,"currentLaneDefault":false,
        "currentParents":[reference('d')],"isLegacy":false,"mainModelKnown":false})
}
#[test]
fn fast_forward_rewrites_to_common_and_preserves_previous_order() {
    let mut input = policy();
    input["currentParents"] = json!([reference('d'), reference('e')]);
    assert_eq!(
        request(input)["data"],
        json!({"action":"rewrite","parentChoice":"common",
        "parents":[reference('a')],"previousParents":[reference('d'),reference('e')]}),
    );
}
#[test]
fn divergence_requires_detach_and_source_only_or_equal_skips() {
    let mut input = policy();
    input["sourceOnly"] = json!([reference('e')]);
    assert_eq!(request(input.clone())["data"], json!({"action":"skip"}));
    input["detachHead"] = json!(true);
    assert_eq!(request(input.clone())["data"]["action"], "rewrite");
    input["targetOnly"] = json!([]);
    assert_eq!(request(input.clone())["data"], json!({"action":"skip"}));
    input["sourceOnly"] = json!([]);
    assert_eq!(request(input)["data"], json!({"action":"skip"}));
}
#[test]
fn missing_version_check_follows_early_skip() {
    let mut input = policy();
    input
        .as_object_mut()
        .unwrap()
        .remove("currentParents");
    input
        .as_object_mut()
        .unwrap()
        .remove("isLegacy");
    assert_eq!(request(input.clone())["data"], json!({"action":"requireVersion"}));
    input["sourceOnly"] = json!([reference('e')]);
    assert_eq!(request(input)["data"], json!({"action":"skip"}));
}
#[test]
fn one_target_one_parent_common_skips_even_when_parent_differs() {
    let mut input = policy();
    input["targetOnly"] = json!([reference('b')]);
    assert_eq!(request(input.clone())["data"], json!({"action":"skip"}));
    input["currentParents"] = json!([reference('d'), reference('e')]);
    assert_eq!(request(input)["data"]["action"], "rewrite");
}
#[test]
fn no_common_lane_requires_model_before_parent_rewrite() {
    let mut input = policy();
    input
        .as_object_mut()
        .unwrap()
        .remove("common");
    assert_eq!(request(input.clone())["data"], json!({"action":"requireMainModel"}));
    input["mainModelKnown"] = json!(true);
    input["mainHead"] = json!(reference('e'));
    let output = request(input.clone());
    assert_eq!(output["data"]["parentChoice"], "main");
    assert_eq!(output["data"]["parents"], json!([reference('e')]));
    input
        .as_object_mut()
        .unwrap()
        .remove("mainHead");
    assert_eq!(request(input)["data"]["parents"], json!([]));
}
#[test]
fn main_without_common_does_not_lookup_model_and_clears_legacy_parents() {
    let mut input = policy();
    input
        .as_object_mut()
        .unwrap()
        .remove("common");
    input["currentLaneDefault"] = json!(true);
    input["isLegacy"] = json!(true);
    assert_eq!(
        request(input)["data"],
        json!({"action":"rewrite","parentChoice":"none",
        "parents":[],"previousParents":[reference('d')]}),
    );
}
#[test]
fn legacy_common_and_main_leave_parent_array_values_intact() {
    let mut input = policy();
    input["isLegacy"] = json!(true);
    assert_eq!(request(input.clone())["data"]["parents"], json!([reference('d')]));
    input
        .as_object_mut()
        .unwrap()
        .remove("common");
    input["mainModelKnown"] = json!(true);
    input["mainHead"] = json!(reference('e'));
    assert_eq!(request(input)["data"]["parents"], json!([reference('d')]));
}
struct Fixture(PathBuf);
impl Fixture {
    fn new() -> Self {
        static NEXT: AtomicU64 = AtomicU64::new(0);
        let root = std::env::temp_dir()
            .join(format!(
                "bit-squash-history-{}-{}",
                std::process::id(),
                NEXT.fetch_add(1, Ordering::Relaxed),
            ));
        fs::create_dir_all(&root).unwrap();
        Self(root)
    }
    fn write(&self, hash: &str, header_hash: &str, body: &Value) {
        let path = self.0.join(&hash[..2]).join(&hash[2..]);
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        let mut encoder = ZlibEncoder::new(Vec::new(), Compression::default());
        encoder
            .write_all(format!("Version {header_hash} 1\0").as_bytes())
            .unwrap();
        encoder
            .write_all(&serde_json::to_vec(body).unwrap())
            .unwrap();
        fs::write(path, encoder.finish().unwrap()).unwrap();
    }
    fn messages(&self, refs: impl serde::Serialize) -> Value {
        request(json!({"kind":"squashMessages","objectsDirectory":self.0,"refs":refs}))
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        fs::remove_dir_all(&self.0).unwrap();
    }
}
fn body(message: impl serde::Serialize) -> Value {
    json!({"mainFile":"index.js","files":[],"parents":[],"log":{"message":message}})
}
#[test]
fn messages_preserve_ref_order_unicode_empty_and_missing_values() {
    let fixture = Fixture::new();
    let first = reference('a');
    let second = reference('b');
    let third = reference('c');
    fixture.write(&first, &first, &body(json!("α\r\n😀\u{2028}")));
    fixture.write(&second, &second, &body(json!("")));
    let mut absent = body(Value::Null);
    absent["log"]
        .as_object_mut()
        .unwrap()
        .remove("message");
    fixture.write(&third, &third, &absent);
    assert_eq!(
        fixture.messages(vec![third, first.clone(), second, first])["data"]["messages"],
        json!(["", "α\r\n😀\u{2028}", "", "α\r\n😀\u{2028}"]),
    );
}
#[test]
fn mutable_random_version_identity_is_read_fresh_every_batch() {
    let fixture = Fixture::new();
    let hash = reference('d');
    fixture.write(&hash, &hash, &body(json!("before")));
    assert_eq!(fixture.messages(vec![hash.clone()])["data"]["messages"], json!(["before"]));
    fixture.write(&hash, &hash, &body(json!("after")));
    assert_eq!(fixture.messages(vec![hash])["data"]["messages"], json!(["after"]));
}
#[test]
fn corrupted_header_metadata_and_missing_decline_whole_batch() {
    let fixture = Fixture::new();
    let first = reference('a');
    let second = reference('b');
    fixture.write(&first, &first, &body(json!("valid")));
    fixture.write(&second, &first, &body(json!("badheader")));
    assert_eq!(fixture.messages(vec![first.clone(), second.clone()])["failed"], true);
    let mut invalid = body(json!("badfiles"));
    invalid["files"] = json!({});
    fixture.write(&second, &second, &invalid);
    assert_eq!(fixture.messages(vec![first.clone(), second.clone()])["failed"], true);
    invalid = body(json!("badparents"));
    invalid["parents"] = json!(true);
    fixture.write(&second, &second, &invalid);
    assert_eq!(fixture.messages(vec![first.clone(), second])["failed"], true);
    assert_eq!(fixture.messages(vec![first, reference('c')])["failed"], true);
}
#[test]
fn output_budget_fails_without_partial_data_and_count_limit_precedes_read() {
    let fixture = Fixture::new();
    let hash = reference('a');
    fixture.write(&hash, &hash, &body(json!("x".repeat(5 * 1024 * 1024))));
    let output = fixture.messages(vec![hash.clone()]);
    assert_eq!(output, json!({"version":1,"id":21,"completed":0,"skipped":[],"failed":true}));
    assert_eq!(fixture.messages(vec![hash; 4097])["failed"], true);
}
fn record(hash: &str) -> Value {
    json!({"hash":hash,"parents":[]})
}
#[test]
fn history_rebase_updates_only_first_existing_incoming_record() {
    let first = reference('a');
    let second = reference('b');
    let third = reference('c');
    assert_eq!(
        request(json!({"kind":"historyRebase","existingHashes":[second,first],
        "incoming":[record(&third),record(&first),record(&second)]}))["data"],
        json!({"incomingIndex":1,"existingIndex":1}),
    );
    assert_eq!(
        request(
            json!({"kind":"historyRebase","existingHashes":[first],"incoming":[record(&third)]})
        )["data"],
        json!({}),
    );
}
#[test]
fn invalid_parent_metadata_and_unknown_fields_decline() {
    let mut input = policy();
    input["unknown"] = json!(true);
    assert_eq!(request(input)["failed"], true);
    let hash = reference('a');
    assert_eq!(
        request(json!({"kind":"historyRebase","existingHashes":[hash],
        "incoming":[{"hash":hash,"parents":["bad"]}]}))["failed"],
        true,
    );
}

#[test]
fn nonstring_messages_match_canonical_legacy_normalization() {
    let fixture = Fixture::new();
    let hash = reference('a');
    for message in
        [json!(false), json!(true), json!(42), json!({"text":"object"}), json!([]), Value::Null]
    {
        fixture.write(&hash, &hash, &body(message));
        assert_eq!(fixture.messages(vec![hash.clone()])["data"]["messages"], json!([""]));
    }
}
#[test]
fn complete_batch_raw_budget_declines_without_partial_messages() {
    let fixture = Fixture::new();
    let first = reference('a');
    let second = reference('b');
    let mut version = body(json!("small"));
    version["ignoredPadding"] = json!("x".repeat(18 * 1024 * 1024));
    fixture.write(&first, &first, &version);
    fixture.write(&second, &second, &version);
    let output = fixture.messages(vec![first, second]);
    assert_eq!(output["failed"], true);
    assert_eq!(output["completed"], 0);
    assert!(output.get("data").is_none());
}
