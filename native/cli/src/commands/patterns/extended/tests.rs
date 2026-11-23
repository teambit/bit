//! Unit tests for extended component pattern [`matching`], sequence braces, and `minimatch` extglobs.
//!
//! Verifies character classes, `+(...)` / `!(...)` extglobs, and numeric `{start..end}` braces across [`matching`].

/// Splits `pattern` and returns the matching subset of `ids` via [`super::matching`].
fn matching<'a>(ids: &[&'a str], pattern: &str) -> Vec<&'a str> {
    super::matching(ids, &crate::commands::patterns::split(pattern)).unwrap()
}

/// Verifies character classes, `+(...)` extglobs, and comma-splitting quirks in [`matching`].
#[test]
fn extended_patterns_keep_bits_split_and_version_quirks() {
    let ids = ["scope/ui/button", "scope/ui/card", "scope/ui/button2", "scope/ui/label"];
    assert_eq!(matching(&ids, "**/[bc]*"), [&ids[0], &ids[1], &ids[2]].map(|id| *id));
    assert_eq!(matching(&ids, "**/+(button|card)"), [ids[0], ids[1]]);
    assert!(matching(&ids, "**/@(button|card)").is_empty());
    assert!(matching(&ids, "**/{button,card}").is_empty());
    assert_eq!(matching(&ids, "**, !**/button, **/button"), [ids[0], ids[1], ids[2], ids[3]]);
}

/// Verifies that `{start..end}` sequence braces and `!(...)` negative extglobs follow `minimatch` in [`matching`].
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

/// Verifies that [`matching`] returns an empty vector when given an empty component ID slice.
///
/// Confirms extended character-class globs evaluate cleanly against `&[]`.
#[test]
fn empty_id_slice_returns_empty_matches_for_extended_glob() {
    assert!(matching(&[], "**/[a-z]*").is_empty());
}
