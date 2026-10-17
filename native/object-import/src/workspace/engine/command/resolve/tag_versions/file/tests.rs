use super::tag_data;
use serde_json::{Value, json};

#[test]
fn explicit_first_match_and_default_cover_selected_and_automatic_components() {
    let file = json!({"entries":[{"identity":"remote/foo","version":"2.0.0-beta.1"},{"identity":"remote/foo","version":"3.0.0"}],"default":"minor"});
    assert_eq!(
        tag_data(Some(&file), "remote/foo").unwrap(),
        json!({"versionToTag":"2.0.0-beta.1","prereleaseId":"beta"}),
    );
    assert_eq!(
        tag_data(Some(&file), "remote/bar").unwrap(),
        json!({"versionToTag":"minor","prereleaseId":null}),
    );
    assert_eq!(
        tag_data(Some(&json!({"entries":[],"default":null})), "remote/foo").unwrap(),
        Value::Null,
    );
}
