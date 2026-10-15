use super::equal;
use serde_json::json;

#[test]
fn own_undefined_keys_differ_from_absence_and_null() {
    let absent = json!({"data":{}});
    let undefined = json!({"data":{},"dataUndefinedKeys":["name"]});
    let null = json!({"data":{"name":null}});
    assert!(!equal(&absent, &undefined));
    assert!(!equal(&null, &undefined));
    assert!(equal(&absent, &json!({"data":{},"dataUndefinedKeys":[]})));
}

#[test]
fn undefined_sets_and_object_properties_ignore_order() {
    let left = json!({"data":{"a":1,"b":[true]},"dataUndefinedKeys":["name","description"]});
    let right = json!({"data":{"b":[true],"a":1},"dataUndefinedKeys":["description","name"]});
    assert!(equal(&left, &right));
    assert!(!equal(&left, &json!({"data":{},"dataUndefinedKeys":["name","description"]})));
}

#[test]
fn invalid_undefined_metadata_declines_before_planning() {
    for keys in [json!(["name", "name"]), json!([1]), json!(["present"]), json!(null)] {
        let entry = json!({"stringId":"x","idWithoutVersion":"x","config":{},"configJson":"{}","configPretty":"{}","data":{"present":true},"dataUndefinedKeys":keys});
        let input = json!({"current":[entry],"base":[],"other":[]});
        assert!(super::super::super::validate::component(&input).is_err());
    }
}
