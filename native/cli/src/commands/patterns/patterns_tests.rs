use super::{matching, split};

const IDS: [&str; 5] =
    ["org.scope/ui/button", "org.scope/ui/card", "org.scope/utils", "other/utils", "other/.hidden"];

fn matched(pattern: &str) -> Vec<&'static str> {
    matching(&IDS, &split(pattern)).unwrap()
}

#[test]
fn globs_match_like_minimatch() {
    assert_eq!(matched("org.scope/ui/*"), ["org.scope/ui/button", "org.scope/ui/card"]);
    assert_eq!(matched("org.scope/*"), ["org.scope/utils"]);
    assert_eq!(
        matched("org.scope/**"),
        ["org.scope/ui/button", "org.scope/ui/card", "org.scope/utils"],
    );
    assert_eq!(matched("**/utils"), ["org.scope/utils", "other/utils"]);
    assert_eq!(matched("other/*"), ["other/utils"], "no dot segments");
    assert_eq!(matched("*/ui/c?rd"), ["org.scope/ui/card"]);
    assert_eq!(matched("org.scope/ui/button@1.0.0"), ["org.scope/ui/button"]);
    assert!(matched("button").is_empty(), "no basename matching");
}

#[test]
fn lists_and_negations() {
    assert_eq!(matched("other/utils, org.scope/utils"), ["org.scope/utils", "other/utils"]);
    assert_eq!(matched("**, !org.scope/ui/**"), ["org.scope/utils", "other/utils"]);
    assert_eq!(
        matched("!other/**"),
        ["org.scope/ui/button", "org.scope/ui/card", "org.scope/utils"],
    );
    assert_eq!(matched("!org.scope/**, org.scope/utils"), ["org.scope/utils"]);
}

#[test]
fn other_globs_are_left_to_node() {
    for pattern in
        ["org.scope/[ab]*", "org.scope/{ui,utils}", "org.scope/+(ui)", "#comment", r"a\*"]
    {
        assert!(matching(&IDS, &split(pattern)).is_err(), "{pattern}");
    }
}
