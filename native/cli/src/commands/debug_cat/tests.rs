use super::{
    IdJsonOptions, ObjectOptions, parse_id_json_options, parse_object_options, parse_single_id,
};

#[test]
fn parses_cat_object_flags_and_hash() {
    let hash = "0123456789abcdef0123456789abcdef01234567";
    assert_eq!(
        parse_object_options(&[hash, "-p", "-s", "--headers"]),
        Some(ObjectOptions { hash: hash.to_owned(), pretty: true, stringify: true, headers: true }),
    );
    assert_eq!(parse_object_options(&["not-a-hash"]), None);
}

#[test]
fn parses_cat_component_and_version_history_flags() {
    assert_eq!(
        parse_id_json_options(&["comp1@0.0.1", "--json"]),
        Some(IdJsonOptions { id: "comp1@0.0.1".to_owned(), json: true }),
    );
    assert_eq!(parse_id_json_options(&["--help"]), None);
    assert_eq!(parse_single_id(&["my-lane"]), Some("my-lane".to_owned()));
}
