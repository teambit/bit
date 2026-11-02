//! Oracle tests ([`ORACLE`]) comparing component pattern [`matching`] and [`split`] against released `multimatch` / `minimatch` behavior.
//!
//! Verifies every pattern in `oracle.txt` against [`IDS`] for exact `multimatch` 5 / `minimatch` 3.1.5 parity.

use super::{matching, split};

/// Canonical component ID fixture list used by the `multimatch` / `minimatch` oracle tests.
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

/// Verifies that [`matching`] and [`split`] agree with every `multimatch` case in [`ORACLE`].
#[test]
fn matches_agree_with_multimatch() {
    for line in ORACLE.lines() {
        let (pattern, expected) = line.split_once('\t').unwrap();
        let expected: Vec<String> = serde_json::from_str(expected).unwrap();
        assert_eq!(matching(&IDS, &split(pattern)).unwrap(), expected, "{pattern}");
    }
}

/// Verifies that [`split`] trims leading and trailing whitespace around comma-separated pattern segments.
///
/// Ensures whitespace-padded pattern lists normalize identically to `multimatch` inputs.
#[test]
fn split_trims_comma_separated_segments() {
    assert_eq!(split(" a/b , c/d "), ["a/b", "c/d"]);
}
