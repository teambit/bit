use super::{matching, split};

const IDS: [&str; 10] = [
    "org.scope/ui/button",
    "org.scope/ui/card",
    "org.scope/utils",
    "other/utils",
    "other/.hidden",
    "a/b/c/d",
    "a/bc",
    "a/b",
    "x.y/z-w",
    "s/ab/cd",
];

/// Results `multimatch` 5 with `minimatch` 3.1.5 gave for these patterns.
const ORACLE: &str = include_str!("oracle.txt");

#[test]
fn matches_agree_with_multimatch() {
    for line in ORACLE.lines() {
        let (pattern, expected) = line.split_once('\t').unwrap();
        let expected: Vec<String> = serde_json::from_str(expected).unwrap();
        assert_eq!(matching(&IDS, &split(pattern)).unwrap(), expected, "{pattern}");
    }
}
