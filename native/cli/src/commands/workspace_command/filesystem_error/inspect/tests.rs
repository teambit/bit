//! Error property strings retain Node's quote selection and control-character escaping.
use std::process::Command;

#[test]
fn filesystem_error_strings_match_node_inspection() {
    let mut values = vec![
        "plain path".to_owned(),
        "single'quote".into(),
        r#"both'"quotes"#.into(),
        r#"all'"`quotes"#.into(),
        r#"template'"${value}"#.into(),
        "a\\b\nc\rd\te".into(),
        "unicode-λ-😀".into(),
    ];
    values.extend(
        (0..=159)
            .filter_map(char::from_u32)
            .filter(|value| value.is_control())
            .map(|value| format!("before{value}after")),
    );
    let script = "const util=require('util');console.log(JSON.stringify(JSON.parse(process.argv[1]).map(value=>util.inspect(value))))";
    let result = Command::new("node")
        .args(["-e", script, &serde_json::to_string(&values).unwrap()])
        .output()
        .unwrap();
    assert!(result.status.success(), "{result:?}");
    let expected: Vec<String> = serde_json::from_slice(&result.stdout).unwrap();
    let actual: Vec<_> = values
        .iter()
        .map(|value| super::quote(value))
        .collect();
    assert_eq!(actual, expected);
}
