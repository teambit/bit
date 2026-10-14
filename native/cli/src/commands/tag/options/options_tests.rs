use super::parse;
use serde_json::json;

#[test]
fn release_types_and_versions() {
    let options = parse(&["remote/two", "-m", "x"]).unwrap();
    assert_eq!(options.release.level, "patch");
    assert_eq!(options.patterns, ["remote/two"]);
    assert_eq!(
        options.request(),
        json!({ "message": "x", "unmodified": false, "unmerged": false, "build": false }),
    );
    assert_eq!(
        options.tag_options(),
        json!({ "patterns": ["remote/two"], "releaseType": "patch", "incrementBy": 1, "snapped": false, "skipAutoTag": false }),
    );
    assert_eq!(parse(&["--minor"]).unwrap().release.level, "minor");
    assert_eq!(
        parse(&["-l", "premajor", "--prerelease-id", "beta"])
            .unwrap()
            .release
            .pre_release_id
            .as_deref(),
        Some("beta"),
    );
    let pre = parse(&["--pre-release", "rc"]).unwrap();
    assert_eq!(
        (pre.release.level.as_str(), pre.release.pre_release_id.as_deref()),
        ("prerelease", Some("rc")),
    );
    assert_eq!(parse(&["--pre-release"]).unwrap().release.pre_release_id, None);
    assert_eq!(parse(&["-v", "v1.2.3"]).unwrap().release.exact_version.as_deref(), Some("1.2.3"));
    assert_eq!(parse(&["--increment-by", "3"]).unwrap().release.increment_by, 3);
}

#[test]
fn invalid_or_canonical_flags_are_left_to_node() {
    for args in [
        &["--build"][..],
        &["--soft"],
        &["--minor", "--major"],
        &["--prerelease-id", "beta"],
        &["--increment", "huge"],
        &["--auto-tag-increment", "minor", "--skip-auto-tag"],
        &["--ver", "nope"],
        &["--increment-by", "0"],
        &["-m"],
        &["$modified"],
    ] {
        assert!(parse(args).is_none(), "{args:?}");
    }
}
