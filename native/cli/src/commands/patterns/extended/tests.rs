fn matching<'a>(ids: &[&'a str], pattern: &str) -> Vec<&'a str> {
    super::matching(ids, &crate::commands::patterns::split(pattern)).unwrap()
}

#[test]
fn extended_patterns_keep_bits_split_and_version_quirks() {
    let ids = ["scope/ui/button", "scope/ui/card", "scope/ui/button2", "scope/ui/label"];
    assert_eq!(matching(&ids, "**/[bc]*"), [&ids[0], &ids[1], &ids[2]].map(|id| *id));
    assert_eq!(matching(&ids, "**/+(button|card)"), [ids[0], ids[1]]);
    assert!(matching(&ids, "**/@(button|card)").is_empty());
    assert!(matching(&ids, "**/{button,card}").is_empty());
    assert_eq!(matching(&ids, "**, !**/button, **/button"), [ids[0], ids[1], ids[2], ids[3]]);
}

#[test]
fn sequence_braces_and_negative_extglobs_follow_minimatch() {
    let ids = ["s/comp01", "s/comp02", "s/comp03", "s/foo", "s/foobar", "s/card"];
    assert_eq!(matching(&ids, "**/comp{01..03}"), ids[..3]);
    assert_eq!(matching(&ids, "**/comp{03..01..2}"), [ids[0], ids[2]]);
    assert_eq!(matching(&ids, "**/!(foo)*"), [ids[0], ids[1], ids[2], ids[5]]);
}

/// Results produced by the pinned CLI's actual multimatch/minimatch modules,
/// including Bit's comma/version splitting before minimatch runs.
#[test]
fn read_only_patterns_match_released_node_oracle() {
    let oracle: serde_json::Value = serde_json::from_str(include_str!("oracle.json")).unwrap();
    let ids: Vec<&str> = oracle["ids"]
        .as_array()
        .unwrap()
        .iter()
        .map(|id| id.as_str().unwrap())
        .collect();
    for case in oracle["cases"].as_array().unwrap() {
        assert_eq!(
            serde_json::json!(matching(&ids, case["pattern"].as_str().unwrap())),
            case["expected"],
            "{}",
            case["pattern"],
        );
    }
}
